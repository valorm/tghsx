// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import "./TGHSXToken.sol";

/**
 * @title OptimizedCollateralVault
 * @dev A vault contract that manages ETH collateral and mints tGHSX tokens, with synthetic ETH/USD price calculation 
 *      from ETH/BTC and BTC/USD feeds. This version includes configurable parameters and enhanced security features.
 */
contract CollateralVault is Ownable, ReentrancyGuard, Pausable {
    // --- Constants ---
    uint256 public constant PRICE_PRECISION = 1e8;          // Precision for price feeds (8 decimals)
    uint256 public constant RATIO_PRECISION = 10000;        // Precision for ratios (10000 = 100.00%)
    uint256 public constant LIQUIDATION_BONUS = 500;        // 5% bonus for liquidators
    uint256 public constant MAX_LIQUIDATION_PERCENT = 5000; // Maximum 50% of debt can be liquidated
    uint256 public constant MIN_DEBT_AMOUNT = 1e18;         // Minimum debt of 1 tGHSX
    uint256 public constant MIN_COLLATERAL_AMOUNT = 1e15;   // Minimum collateral of 0.001 ETH
    
    // --- Configurable Parameters ---
    uint256 public priceStalenesThreshold = 3600;           // 1 hour staleness threshold for price feeds
    uint256 public constant MIN_STALENESS_THRESHOLD = 300;  // Minimum threshold: 5 minutes
    uint256 public constant MAX_STALENESS_THRESHOLD = 86400;// Maximum threshold: 24 hours

    // --- Immutable & State Variables ---
    TGHSXToken public immutable tghsxToken;                 // tGHSX token contract
    
    // Price feeds for synthetic ETH/USD calculation
    AggregatorV3Interface public immutable ethBtcPriceFeed; // ETH/BTC price feed
    AggregatorV3Interface public immutable btcUsdPriceFeed; // BTC/USD price feed

    uint256 public ghsUsdPrice;                             // Manually updated GHS/USD price

    // --- Structs ---
    struct UserPosition {
        uint128 ethCollateral;  // Amount of ETH collateral in wei
        uint128 tghsxMinted;    // Amount of tGHSX minted in wei
    }

    struct VaultConfig {
        uint64 minCollateralRatio;  // Minimum collateral ratio (e.g., 15000 = 150%)
        uint64 liquidationRatio;    // Liquidation threshold (e.g., 14000 = 140%)
        uint64 maxCollateralRatio;  // Maximum allowed ratio (e.g., 50000 = 500%)
        uint64 lastConfigUpdate;    // Timestamp of last config update
    }

    // --- State ---
    mapping(address => UserPosition) public userPositions;  // User positions mapping
    VaultConfig public vaultConfig;                         // Vault configuration
    address public treasury;                                // Treasury address for fees
    uint256 public stabilityFeeRate = 0;                    // Stability fee rate (currently unused)
    mapping(address => uint256) public lastFeeUpdate;       // Last fee update timestamp per user
    mapping(address => bool) public emergencyAuthorized;    // Emergency access control
    uint256 public maxSingleDeposit = 1000 ether;           // Maximum single deposit in ETH
    uint256 public totalValueLocked;                        // Total ETH locked in the vault

    // --- Events ---
    event CollateralDeposited(address indexed user, uint256 amount, uint256 indexed blockNumber);
    event CollateralWithdrawn(address indexed user, uint256 amount);
    event TGHSXMinted(address indexed user, uint256 amount, uint256 indexed newRatio);
    event TGHSXBurned(address indexed user, uint256 amount, uint256 indexed newRatio);
    event VaultLiquidated(address indexed user, address indexed liquidator, uint256 repaidTGHSX, uint256 liquidatedETH, uint256 bonus);
    event GhsPriceUpdated(uint256 newPrice, address indexed updater);
    event StalenesThresholdUpdated(uint256 newThreshold, address indexed updater);

    // --- Errors ---
    error InvalidAmount();
    error InsufficientCollateral();
    error InsufficientDebt();
    error VaultUndercollateralized();
    error VaultNotLiquidatable();
    error InvalidAddress();
    error TransferFailed();
    error PriceStale();
    error InvalidPrice();
    error InvalidThreshold();
    
    // --- Constructor ---
    constructor(
        address _tghsxTokenAddress,
        address _ethBtcPriceFeed,
        address _btcUsdPriceFeed,
        address _treasury,
        uint256 _initialGhsPrice
    ) Ownable(msg.sender) {
        tghsxToken = TGHSXToken(_tghsxTokenAddress);
        ethBtcPriceFeed = AggregatorV3Interface(_ethBtcPriceFeed);
        btcUsdPriceFeed = AggregatorV3Interface(_btcUsdPriceFeed);
        treasury = _treasury;
        ghsUsdPrice = _initialGhsPrice;
        
        vaultConfig = VaultConfig({
            minCollateralRatio: 15000,  // 150%
            liquidationRatio: 14000,    // 140%
            maxCollateralRatio: 50000,  // 500%
            lastConfigUpdate: uint64(block.timestamp)
        });
        emergencyAuthorized[msg.sender] = true; // Owner has emergency access
    }

    // --- Admin Functions ---
    
    /**
     * @dev Checks if an address has admin privileges
     * @param account Address to check
     * @return bool True if the account is the owner
     */
    function isAdmin(address account) external view returns (bool) {
        return account == owner();
    }

    /**
     * @dev Updates the price staleness threshold
     * @param newThreshold New threshold in seconds
     */
    function updateStalenesThreshold(uint256 newThreshold) external onlyOwner {
        if (newThreshold < MIN_STALENESS_THRESHOLD || newThreshold > MAX_STALENESS_THRESHOLD) {
            revert InvalidThreshold();
        }
        priceStalenesThreshold = newThreshold;
        emit StalenesThresholdUpdated(newThreshold, msg.sender);
    }

    /**
     * @dev Updates the GHS/USD price
     * @param _newPrice New price scaled by PRICE_PRECISION
     */
    function updateGhsPrice(uint256 _newPrice) external onlyOwner {
        if (_newPrice == 0) revert InvalidPrice();
        ghsUsdPrice = _newPrice;
        emit GhsPriceUpdated(_newPrice, msg.sender);
    }

    // --- Price Functions ---

    /**
     * @dev Calculates the ETH price in GHS using synthetic ETH/USD from ETH/BTC and BTC/USD feeds
     * @return uint256 ETH price in GHS, scaled by PRICE_PRECISION
     */
    function getEthGhsPrice() public view returns (uint256) {
        (, int256 ethBtcPrice, , uint256 ethBtcTimestamp, ) = ethBtcPriceFeed.latestRoundData();
        (, int256 btcUsdPrice, , uint256 btcUsdTimestamp, ) = btcUsdPriceFeed.latestRoundData();

        uint256 currentTime = block.timestamp;
        if (currentTime - ethBtcTimestamp > priceStalenesThreshold || 
            currentTime - btcUsdTimestamp > priceStalenesThreshold) {
            revert PriceStale();
        }
        if (ethBtcPrice <= 0 || btcUsdPrice <= 0) {
            revert InvalidPrice();
        }

        uint256 syntheticEthUsdPrice = uint256((ethBtcPrice * btcUsdPrice) / int256(PRICE_PRECISION));
        uint256 ethGhsPrice = (syntheticEthUsdPrice * ghsUsdPrice) / PRICE_PRECISION;

        return ethGhsPrice;
    }

    // --- Core Functions ---

    /**
     * @dev Deposits ETH as collateral
     */
    function deposit() external payable nonReentrant whenNotPaused {
        if (msg.value == 0) revert InvalidAmount();
        userPositions[msg.sender].ethCollateral += uint128(msg.value);
        totalValueLocked += msg.value;
        emit CollateralDeposited(msg.sender, msg.value, block.number);
    }
    
    /**
     * @dev Withdraws ETH collateral
     * @param amount Amount of ETH to withdraw in wei
     */
    function withdraw(uint256 amount) external nonReentrant whenNotPaused {
        if (amount == 0) revert InvalidAmount();
        UserPosition storage position = userPositions[msg.sender];
        if (position.ethCollateral < amount) revert InsufficientCollateral();

        uint128 newCollateral = position.ethCollateral - uint128(amount);
        if (position.tghsxMinted > 0) {
            uint256 ratio = _calculateCollateralizationRatio(newCollateral, position.tghsxMinted);
            if (ratio < vaultConfig.minCollateralRatio) revert VaultUndercollateralized();
        }
        
        position.ethCollateral = newCollateral;
        totalValueLocked -= amount;
        _transferETH(msg.sender, amount);
        emit CollateralWithdrawn(msg.sender, amount);
    }

    /**
     * @dev Mints tGHSX tokens against ETH collateral
     * @param amount Amount of tGHSX to mint in wei
     */
    function mintTGHSX(uint256 amount) external nonReentrant whenNotPaused {
        if (amount < MIN_DEBT_AMOUNT) revert InvalidAmount();
        UserPosition storage position = userPositions[msg.sender];
        if (position.ethCollateral == 0) revert InsufficientCollateral();
        
        uint128 newDebt = position.tghsxMinted + uint128(amount);
        uint256 ratio = _calculateCollateralizationRatio(position.ethCollateral, newDebt);
        if (ratio < vaultConfig.minCollateralRatio) revert VaultUndercollateralized();
        
        position.tghsxMinted = newDebt;
        tghsxToken.mint(msg.sender, amount);
        emit TGHSXMinted(msg.sender, amount, ratio);
    }
    
    /**
     * @dev Burns tGHSX tokens to reduce debt
     * @param amount Amount of tGHSX to burn in wei
     */
    function burnTGHSX(uint256 amount) external nonReentrant whenNotPaused {
        if (amount == 0) revert InvalidAmount();
        UserPosition storage position = userPositions[msg.sender];
        if (position.tghsxMinted < amount) revert InsufficientDebt();
        
        position.tghsxMinted -= uint128(amount);
        tghsxToken.burnFrom(msg.sender, amount);
        uint256 ratio = _calculateCollateralizationRatio(position.ethCollateral, position.tghsxMinted);
        emit TGHSXBurned(msg.sender, amount, ratio);
    }

    // --- Liquidation ---

    /**
     * @dev Liquidates an undercollateralized vault
     * @param user Address of the user to liquidate
     * @param tghsxToRepay Amount of tGHSX to repay in wei
     */
    function liquidateVault(address user, uint256 tghsxToRepay) external nonReentrant {
        UserPosition storage position = userPositions[user];
        if (position.tghsxMinted == 0) revert InsufficientDebt();
        
        uint256 ratio = _calculateCollateralizationRatio(position.ethCollateral, position.tghsxMinted);
        if (ratio >= vaultConfig.liquidationRatio) revert VaultNotLiquidatable();
        
        uint256 maxLiquidation = (uint256(position.tghsxMinted) * MAX_LIQUIDATION_PERCENT) / RATIO_PRECISION;
        if (tghsxToRepay > maxLiquidation) revert InvalidAmount();
        
        uint256 ethGhsPrice = getEthGhsPrice();
        uint256 liquidatedETH = (tghsxToRepay * PRICE_PRECISION) / ethGhsPrice;
        uint256 bonus = (liquidatedETH * LIQUIDATION_BONUS) / RATIO_PRECISION;
        uint256 totalETH = liquidatedETH + bonus;
        
        if (position.ethCollateral < totalETH) revert InsufficientCollateral();
        
        position.ethCollateral -= uint128(totalETH);
        position.tghsxMinted -= uint128(tghsxToRepay);
        totalValueLocked -= totalETH;
        
        tghsxToken.burnFrom(msg.sender, tghsxToRepay);
        _transferETH(msg.sender, totalETH);
        
        emit VaultLiquidated(user, msg.sender, tghsxToRepay, liquidatedETH, bonus);
    }

    // --- View Functions ---

    /**
     * @dev Retrieves a user's position details
     * @param user The address of the user
     * @return ethCollateral The amount of ETH collateral deposited in wei
     * @return tghsxMinted The amount of tGHSX minted in wei
     * @return collateralizationRatio The collateralization ratio (scaled by RATIO_PRECISION)
     * @return isLiquidatable Whether the position is liquidatable
     * @return accruedFees The accrued stability fees (placeholder, currently 0)
     */
    function getUserPosition(address user) public view returns (
        uint256 ethCollateral,
        uint256 tghsxMinted,
        uint256 collateralizationRatio,
        bool isLiquidatable,
        uint256 accruedFees
    ) {
        UserPosition memory position = userPositions[user];
        ethCollateral = uint256(position.ethCollateral);
        tghsxMinted = uint256(position.tghsxMinted);

        if (tghsxMinted == 0) {
            collateralizationRatio = type(uint256).max; // Maximum value if no debt
            isLiquidatable = false;
        } else {
            uint256 ethGhsPrice = getEthGhsPrice();
            uint256 collateralValueGHS = (ethCollateral * ethGhsPrice) / 1e18;
            collateralizationRatio = (collateralValueGHS * RATIO_PRECISION) / tghsxMinted;
            isLiquidatable = collateralizationRatio < uint256(vaultConfig.liquidationRatio);
        }

        accruedFees = 0; // Placeholder for future stability fee implementation
    }

    // --- Internal Helpers ---

    /**
     * @dev Calculates the collateralization ratio for a position
     * @param ethCollateral Amount of ETH collateral in wei
     * @param tghsxMinted Amount of tGHSX minted in wei
     * @return uint256 Collateralization ratio scaled by RATIO_PRECISION
     */
    function _calculateCollateralizationRatio(uint128 ethCollateral, uint128 tghsxMinted) internal view returns (uint256) {
        if (tghsxMinted == 0) return type(uint256).max;
        
        uint256 ethGhsPrice = getEthGhsPrice();
        uint256 collateralValueGHS = (uint256(ethCollateral) * ethGhsPrice) / 1e18;
        
        return (collateralValueGHS * RATIO_PRECISION) / uint256(tghsxMinted);
    }

    /**
     * @dev Transfers ETH to an address
     * @param to Recipient address
     * @param amount Amount of ETH in wei
     */
    function _transferETH(address to, uint256 amount) internal {
        (bool success, ) = payable(to).call{value: amount}("");
        if (!success) revert TransferFailed();
    }
}