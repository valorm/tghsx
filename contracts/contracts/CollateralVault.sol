// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import "./TGHSXToken.sol";

/**
 * @title OptimizedCollateralVault V3
 * @dev This version re-introduces atomic functions (depositAndMint, repayAndWithdraw)
 * to significantly reduce gas costs for users by combining multiple operations
 * into a single transaction.
 */
contract CollateralVault is Ownable, ReentrancyGuard, Pausable {
    // --- Constants ---
    uint256 public constant PRICE_PRECISION = 1e8;
    uint256 public constant RATIO_PRECISION = 10000;
    uint256 public constant LIQUIDATION_BONUS = 500;
    uint256 public constant MAX_LIQUIDATION_PERCENT = 5000;
    uint256 public constant MIN_DEBT_AMOUNT = 1e18;
    uint256 public constant MIN_COLLATERAL_AMOUNT = 1e15;
    
    // --- Configurable Parameters ---
    uint256 public priceStalenesThreshold = 3600;
    uint256 public constant MIN_STALENESS_THRESHOLD = 300;
    uint256 public constant MAX_STALENESS_THRESHOLD = 86400;

    // --- Immutable & State Variables ---
    TGHSXToken public immutable tghsxToken;
    AggregatorV3Interface public immutable ethBtcPriceFeed;
    AggregatorV3Interface public immutable btcUsdPriceFeed;
    uint256 public ghsUsdPrice;

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
            minCollateralRatio: 15000,
            liquidationRatio: 14000,
            maxCollateralRatio: 50000,
            lastConfigUpdate: uint64(block.timestamp)
        });
        emergencyAuthorized[msg.sender] = true;
    }

    // --- Admin Functions (Omitted for brevity, no changes) ---
    function isAdmin(address account) external view returns (bool) { return account == owner(); }
    function updateStalenesThreshold(uint256 newThreshold) external onlyOwner { if (newThreshold < MIN_STALENESS_THRESHOLD || newThreshold > MAX_STALENESS_THRESHOLD) { revert InvalidThreshold(); } priceStalenesThreshold = newThreshold; emit StalenesThresholdUpdated(newThreshold, msg.sender); }
    function updateGhsPrice(uint256 _newPrice) external onlyOwner { if (_newPrice == 0) revert InvalidPrice(); ghsUsdPrice = _newPrice; emit GhsPriceUpdated(_newPrice, msg.sender); }

    // --- Price Functions (Omitted for brevity, no changes) ---
    function getEthGhsPrice() public view returns (uint256) { (, int256 ethBtcPrice, , uint256 ethBtcTimestamp, ) = ethBtcPriceFeed.latestRoundData(); (, int256 btcUsdPrice, , uint256 btcUsdTimestamp, ) = btcUsdPriceFeed.latestRoundData(); uint256 currentTime = block.timestamp; if (currentTime - ethBtcTimestamp > priceStalenesThreshold || currentTime - btcUsdTimestamp > priceStalenesThreshold) { revert PriceStale(); } if (ethBtcPrice <= 0 || btcUsdPrice <= 0) { revert InvalidPrice(); } uint256 syntheticEthUsdPrice = uint256((ethBtcPrice * btcUsdPrice) / int256(PRICE_PRECISION)); return (syntheticEthUsdPrice * ghsUsdPrice) / PRICE_PRECISION; }

    // --- Core Single-Action Functions ---
    function deposit() external payable nonReentrant whenNotPaused { if (msg.value == 0) revert InvalidAmount(); userPositions[msg.sender].ethCollateral += uint128(msg.value); totalValueLocked += msg.value; emit CollateralDeposited(msg.sender, msg.value, block.number); }
    function withdraw(uint256 amount) external nonReentrant whenNotPaused { if (amount == 0) revert InvalidAmount(); UserPosition storage position = userPositions[msg.sender]; if (position.ethCollateral < amount) revert InsufficientCollateral(); uint128 newCollateral = position.ethCollateral - uint128(amount); if (position.tghsxMinted > 0) { uint256 ratio = _calculateCollateralizationRatio(newCollateral, position.tghsxMinted); if (ratio < vaultConfig.minCollateralRatio) revert VaultUndercollateralized(); } position.ethCollateral = newCollateral; totalValueLocked -= amount; _transferETH(msg.sender, amount); emit CollateralWithdrawn(msg.sender, amount); }
    function mintTGHSX(uint256 amount) external nonReentrant whenNotPaused { if (amount < MIN_DEBT_AMOUNT) revert InvalidAmount(); UserPosition storage position = userPositions[msg.sender]; if (position.ethCollateral == 0) revert InsufficientCollateral(); uint128 newDebt = position.tghsxMinted + uint128(amount); uint256 ratio = _calculateCollateralizationRatio(position.ethCollateral, newDebt); if (ratio < vaultConfig.minCollateralRatio) revert VaultUndercollateralized(); position.tghsxMinted = newDebt; tghsxToken.mint(msg.sender, amount); emit TGHSXMinted(msg.sender, amount, ratio); }
    function burnTGHSX(uint256 amount) external nonReentrant whenNotPaused { if (amount == 0) revert InvalidAmount(); UserPosition storage position = userPositions[msg.sender]; if (position.tghsxMinted < amount) revert InsufficientDebt(); position.tghsxMinted -= uint128(amount); tghsxToken.burnFrom(msg.sender, amount); uint256 ratio = _calculateCollateralizationRatio(position.ethCollateral, position.tghsxMinted); emit TGHSXBurned(msg.sender, amount, ratio); }

    // --- NEW: Gas-Optimized Atomic Functions ---

    /**
     * @dev Deposits ETH and mints tGHSX in a single transaction to save gas.
     * @param mintAmount The amount of tGHSX to mint.
     */
    function depositAndMint(uint256 mintAmount) external payable nonReentrant whenNotPaused {
        // Deposit collateral first
        if (msg.value > 0) {
            userPositions[msg.sender].ethCollateral += uint128(msg.value);
            totalValueLocked += msg.value;
            emit CollateralDeposited(msg.sender, msg.value, block.number);
        }

        // Then mint tokens
        if (mintAmount > 0) {
            if (mintAmount < MIN_DEBT_AMOUNT) revert InvalidAmount();
            UserPosition storage position = userPositions[msg.sender];
            if (position.ethCollateral == 0) revert InsufficientCollateral();
            
            uint128 newDebt = position.tghsxMinted + uint128(mintAmount);
            uint256 ratio = _calculateCollateralizationRatio(position.ethCollateral, newDebt);
            if (ratio < vaultConfig.minCollateralRatio) revert VaultUndercollateralized();
            
            position.tghsxMinted = newDebt;
            tghsxToken.mint(msg.sender, mintAmount);
            emit TGHSXMinted(msg.sender, mintAmount, ratio);
        }
    }

    /**
     * @dev Repays tGHSX debt and withdraws ETH collateral in a single transaction.
     * @param burnAmount The amount of tGHSX to burn.
     * @param withdrawAmount The amount of ETH to withdraw.
     */
    function repayAndWithdraw(uint256 burnAmount, uint256 withdrawAmount) external nonReentrant whenNotPaused {
        UserPosition storage position = userPositions[msg.sender];

        // Repay debt first
        if (burnAmount > 0) {
            if (position.tghsxMinted < burnAmount) revert InsufficientDebt();
            position.tghsxMinted -= uint128(burnAmount);
            tghsxToken.burnFrom(msg.sender, burnAmount);
            uint256 ratio = _calculateCollateralizationRatio(position.ethCollateral, position.tghsxMinted);
            emit TGHSXBurned(msg.sender, burnAmount, ratio);
        }

        // Then withdraw collateral
        if (withdrawAmount > 0) {
            if (position.ethCollateral < withdrawAmount) revert InsufficientCollateral();
            uint128 newCollateral = position.ethCollateral - uint128(withdrawAmount);
            if (position.tghsxMinted > 0) {
                uint256 ratio = _calculateCollateralizationRatio(newCollateral, position.tghsxMinted);
                if (ratio < vaultConfig.minCollateralRatio) revert VaultUndercollateralized();
            }
            position.ethCollateral = newCollateral;
            totalValueLocked -= withdrawAmount;
            _transferETH(msg.sender, withdrawAmount);
            emit CollateralWithdrawn(msg.sender, withdrawAmount);
        }
    }

    // --- Liquidation (Omitted for brevity, no changes) ---
    function liquidateVault(address user, uint256 tghsxToRepay) external nonReentrant { UserPosition storage position = userPositions[user]; if (position.tghsxMinted == 0) revert InsufficientDebt(); uint256 ratio = _calculateCollateralizationRatio(position.ethCollateral, position.tghsxMinted); if (ratio >= vaultConfig.liquidationRatio) revert VaultNotLiquidatable(); uint256 maxLiquidation = (uint256(position.tghsxMinted) * MAX_LIQUIDATION_PERCENT) / RATIO_PRECISION; if (tghsxToRepay > maxLiquidation) revert InvalidAmount(); uint256 ethGhsPrice = getEthGhsPrice(); uint256 liquidatedETH = (tghsxToRepay * PRICE_PRECISION) / ethGhsPrice; uint256 bonus = (liquidatedETH * LIQUIDATION_BONUS) / RATIO_PRECISION; uint256 totalETH = liquidatedETH + bonus; if (position.ethCollateral < totalETH) revert InsufficientCollateral(); position.ethCollateral -= uint128(totalETH); position.tghsxMinted -= uint128(tghsxToRepay); totalValueLocked -= totalETH; tghsxToken.burnFrom(msg.sender, tghsxToRepay); _transferETH(msg.sender, totalETH); emit VaultLiquidated(user, msg.sender, tghsxToRepay, liquidatedETH, bonus); }

    // --- View & Internal Functions (Omitted for brevity, no changes) ---
    function getUserPosition(address user) public view returns (uint256, uint256, uint256, bool, uint256) { UserPosition memory position = userPositions[user]; uint256 ethCollateral = uint256(position.ethCollateral); uint256 tghsxMinted = uint256(position.tghsxMinted); uint256 collateralizationRatio; bool isLiquidatable; if (tghsxMinted == 0) { collateralizationRatio = type(uint256).max; isLiquidatable = false; } else { uint256 ethGhsPrice = getEthGhsPrice(); uint256 collateralValueGHS = (ethCollateral * ethGhsPrice) / 1e18; collateralizationRatio = (collateralValueGHS * RATIO_PRECISION) / tghsxMinted; isLiquidatable = collateralizationRatio < uint256(vaultConfig.liquidationRatio); } return (ethCollateral, tghsxMinted, collateralizationRatio, isLiquidatable, 0); }
    function _calculateCollateralizationRatio(uint128 ethCollateral, uint128 tghsxMinted) internal view returns (uint256) { if (tghsxMinted == 0) return type(uint256).max; uint256 ethGhsPrice = getEthGhsPrice(); uint256 collateralValueGHS = (uint256(ethCollateral) * ethGhsPrice) / 1e18; return (collateralValueGHS * RATIO_PRECISION) / uint256(tghsxMinted); }
    function _transferETH(address to, uint256 amount) internal { (bool success, ) = payable(to).call{value: amount}(""); if (!success) revert TransferFailed(); }
}
