// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import "./TGHSXToken.sol";

/**
 * @title OptimizedCollateralVault
 * @dev Now calculates the ETH/USD price synthetically from ETH/BTC and BTC/USD feeds. The updated contract is more flexible and secure by making previously hardcoded values 
 */
contract CollateralVault is Ownable, ReentrancyGuard, Pausable {
    // --- Constants ---
    uint256 public constant PRICE_PRECISION = 1e8;
    uint256 public constant RATIO_PRECISION = 10000;
    uint256 public constant LIQUIDATION_BONUS = 500; // 5%
    uint256 public constant MAX_LIQUIDATION_PERCENT = 5000; // 50%
    uint256 public constant MIN_DEBT_AMOUNT = 1e18; // 1 tGHSX
    uint256 public constant MIN_COLLATERAL_AMOUNT = 1e15; // 0.001 ETH
    
    // --- Configurable Parameters ---
    uint256 public priceStalenesThreshold = 3600; // 1 hour - now configurable
    uint256 public constant MIN_STALENESS_THRESHOLD = 300; // 5 minutes
    uint256 public constant MAX_STALENESS_THRESHOLD = 86400; // 24 hours

    // --- Immutable & State Variables ---
    TGHSXToken public immutable tghsxToken;
    
    // --- Price feeds for synthetic ETH/USD calculation ---
    AggregatorV3Interface public immutable ethBtcPriceFeed;
    AggregatorV3Interface public immutable btcUsdPriceFeed;

    uint256 public ghsUsdPrice; // Manually updated GHS price

    // --- Structs ---
    struct UserPosition {
        uint128 ethCollateral;
        uint128 tghsxMinted;
    }

    struct VaultConfig {
        uint64 minCollateralRatio;
        uint64 liquidationRatio;
        uint64 maxCollateralRatio;
        uint64 lastConfigUpdate;
    }

    // --- State ---
    mapping(address => UserPosition) public userPositions;
    VaultConfig public vaultConfig;
    address public treasury;
    uint256 public stabilityFeeRate = 0;
    mapping(address => uint256) public lastFeeUpdate;
    mapping(address => bool) public emergencyAuthorized;
    uint256 public maxSingleDeposit = 1000 ether;
    uint256 public totalValueLocked;

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
        address _ethBtcPriceFeed, // Address for ETH/BTC feed
        address _btcUsdPriceFeed, // Address for BTC/USD feed
        address _treasury,
        uint256 _initialGhsPrice
    ) Ownable(msg.sender) {
        tghsxToken = TGHSXToken(_tghsxTokenAddress);
        ethBtcPriceFeed = AggregatorV3Interface(_ethBtcPriceFeed);
        btcUsdPriceFeed = AggregatorV3Interface(_btcUsdPriceFeed);
        treasury = _treasury;
        ghsUsdPrice = _initialGhsPrice;
        
        vaultConfig = VaultConfig({
            minCollateralRatio: 15000,
            liquidationRatio: 14000,
            maxCollateralRatio: 50000,
            lastConfigUpdate: uint64(block.timestamp)
        });
        emergencyAuthorized[msg.sender] = true;
    }

    // --- Admin Functions ---
    
    /**
     * @dev Check if an address has admin privileges
     */
    function isAdmin(address account) external view returns (bool) {
        return account == owner();
    }

    /**
     * @dev Update the price staleness threshold
     */
    function updateStalenesThreshold(uint256 newThreshold) external onlyOwner {
        if (newThreshold < MIN_STALENESS_THRESHOLD || newThreshold > MAX_STALENESS_THRESHOLD) {
            revert InvalidThreshold();
        }
        priceStalenesThreshold = newThreshold;
        emit StalenesThresholdUpdated(newThreshold, msg.sender);
    }

    /**
     * @dev Update GHS price
     */
    function updateGhsPrice(uint256 _newPrice) external onlyOwner {
        if (_newPrice == 0) revert InvalidPrice();
        ghsUsdPrice = _newPrice;
        emit GhsPriceUpdated(_newPrice, msg.sender);
    }

    // --- Price Functions ---

    /**
     * @dev Calculates the ETH price in GHS.
     * It synthetically calculates ETH/USD from ETH/BTC and BTC/USD feeds,
     * then multiplies by the manually set GHS/USD price.
     */
    function getEthGhsPrice() public view returns (uint256) {
        // Step 1: Get ETH/BTC price
        (, int256 ethBtcPrice, , uint256 ethBtcTimestamp, ) = ethBtcPriceFeed.latestRoundData();

        // Step 2: Get BTC/USD price
        (, int256 btcUsdPrice, , uint256 btcUsdTimestamp, ) = btcUsdPriceFeed.latestRoundData();

        // Step 3: Check for stale prices - NOW USING CONFIGURABLE THRESHOLD
        uint256 currentTime = block.timestamp;
        if (currentTime - ethBtcTimestamp > priceStalenesThreshold || 
            currentTime - btcUsdTimestamp > priceStalenesThreshold) {
            revert PriceStale();
        }
        if (ethBtcPrice <= 0 || btcUsdPrice <= 0) {
            revert InvalidPrice();
        }

        // Step 4: Calculate synthetic ETH/USD price
        uint256 syntheticEthUsdPrice = uint256((ethBtcPrice * btcUsdPrice) / int256(PRICE_PRECISION));

        // Step 5: Calculate final ETH/GHS price
        uint256 ethGhsPrice = (syntheticEthUsdPrice * ghsUsdPrice) / PRICE_PRECISION;

        return ethGhsPrice;
    }

    // --- Core Functions ---
    function deposit() external payable nonReentrant whenNotPaused {
        if (msg.value == 0) revert InvalidAmount();
        userPositions[msg.sender].ethCollateral += uint128(msg.value);
        totalValueLocked += msg.value;
        emit CollateralDeposited(msg.sender, msg.value, block.number);
    }
    
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

    // --- Internal Helpers ---
    function _calculateCollateralizationRatio(uint128 ethCollateral, uint128 tghsxMinted) internal view returns (uint256) {
        if (tghsxMinted == 0) return type(uint256).max;
        
        uint256 ethGhsPrice = getEthGhsPrice();
        uint256 collateralValueGHS = (uint256(ethCollateral) * ethGhsPrice) / 1e18;
        
        return (collateralValueGHS * RATIO_PRECISION) / uint256(tghsxMinted);
    }

    function _transferETH(address to, uint256 amount) internal {
        (bool success, ) = payable(to).call{value: amount}("");
        if (!success) revert TransferFailed();
    }
}
