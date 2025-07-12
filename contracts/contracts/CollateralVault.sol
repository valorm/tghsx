// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import "./TGHSXToken.sol";

/**
 * @title OptimizedCollateralVault
 * @dev UPDATED FEATURES-NEW VERSION: Implements hybrid oracle model and includes
 * all necessary admin and view functions for robust testing and management.
 */
contract CollateralVault is Ownable, ReentrancyGuard, Pausable {
    // --- Constants ---
    uint256 public constant PRICE_PRECISION = 1e8;
    uint256 public constant RATIO_PRECISION = 10000;
    uint256 public constant LIQUIDATION_BONUS = 500; // 5%
    uint256 public constant MAX_LIQUIDATION_PERCENT = 5000; // 50%
    uint256 public constant PRICE_STALENESS_THRESHOLD = 3600; // 1 hour
    uint256 public constant MIN_DEBT_AMOUNT = 1e18; // 1 tGHSX
    uint256 public constant MIN_COLLATERAL_AMOUNT = 1e15; // 0.001 ETH

    // --- Immutable & State Variables ---
    TGHSXToken public immutable tghsxToken;
    AggregatorV3Interface public immutable ethUsdPriceFeed;
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
    event ConfigUpdated(uint256 minRatio, uint256 liquidationRatio, uint256 maxRatio);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event StabilityFeeUpdated(uint256 oldRate, uint256 newRate);
    event EmergencyAction(address indexed executor, string action, address indexed target);

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
    error UnauthorizedEmergencyAction();
    error InvalidConfiguration();

    // --- Modifiers ---
    modifier onlyEmergencyAuthorized() {
        if (!emergencyAuthorized[msg.sender] && msg.sender != owner()) {
            revert UnauthorizedEmergencyAction();
        }
        _;
    }
    
    // --- Constructor ---
    constructor(
        address _tghsxTokenAddress,
        address _ethUsdPriceFeed,
        address _treasury,
        uint256 _initialGhsPrice
    ) Ownable(msg.sender) {
        tghsxToken = TGHSXToken(_tghsxTokenAddress);
        ethUsdPriceFeed = AggregatorV3Interface(_ethUsdPriceFeed);
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

    // --- Price Functions ---
    function getEthGhsPrice() public view returns (uint256) {
        (, int256 ethUsdPrice, , uint256 ethUsdTimestamp, ) = ethUsdPriceFeed.latestRoundData();
        if (block.timestamp - ethUsdTimestamp > PRICE_STALENESS_THRESHOLD) revert PriceStale();
        if (ethUsdPrice <= 0 || ghsUsdPrice == 0) revert InvalidPrice();
        return (uint256(ethUsdPrice) * ghsUsdPrice) / PRICE_PRECISION;
    }

    // --- Core User Functions ---
    // --- FIX: Changed visibility from 'external' to 'public' ---
    function deposit() public payable nonReentrant whenNotPaused {
        if (msg.value < MIN_COLLATERAL_AMOUNT) revert InvalidAmount();
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
        uint256 liquidatedETH = (tghsxToRepay * 1e18) / ethGhsPrice;
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

    // --- Admin Functions ---
    function updateGhsPrice(uint256 _newPrice) external onlyOwner {
        if (_newPrice == 0) revert InvalidPrice();
        ghsUsdPrice = _newPrice;
        emit GhsPriceUpdated(_newPrice, msg.sender);
    }

    function updateVaultConfig(uint64 newMinRatio, uint64 newLiquidationRatio, uint64 newMaxRatio) external onlyOwner {
        if (newLiquidationRatio == 0 || newMinRatio <= newLiquidationRatio || newMinRatio > newMaxRatio) {
            revert InvalidConfiguration();
        }
        vaultConfig.minCollateralRatio = newMinRatio;
        vaultConfig.liquidationRatio = newLiquidationRatio;
        vaultConfig.maxCollateralRatio = newMaxRatio;
        vaultConfig.lastConfigUpdate = uint64(block.timestamp);
        emit ConfigUpdated(newMinRatio, newLiquidationRatio, newMaxRatio);
    }

    function updateTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert InvalidAddress();
        address oldTreasury = treasury;
        treasury = newTreasury;
        emit TreasuryUpdated(oldTreasury, newTreasury);
    }
    
    function updateStabilityFeeRate(uint256 newRate) external onlyOwner {
        if (newRate > 1000) revert InvalidConfiguration(); // Max 10% annual fee
        uint256 oldRate = stabilityFeeRate;
        stabilityFeeRate = newRate;
        emit StabilityFeeUpdated(oldRate, newRate);
    }

    function setEmergencyAuthorization(address user, bool authorized) external onlyOwner {
        if (user == address(0)) revert InvalidAddress();
        emergencyAuthorized[user] = authorized;
    }

    function emergencyPause() external onlyEmergencyAuthorized {
        _pause();
        emit EmergencyAction(msg.sender, "PAUSE", address(this));
    }
    
    function emergencyUnpause() external onlyOwner {
        _unpause();
        emit EmergencyAction(msg.sender, "UNPAUSE", address(this));
    }

    // --- View Functions ---
    function getCollateralizationRatio(address user) public view returns (uint256) {
        UserPosition memory position = userPositions[user];
        return _calculateCollateralizationRatio(position.ethCollateral, position.tghsxMinted);
    }

    function getUserPosition(address user) external view returns (uint256 ethCollateral, uint256 tghsxMinted, uint256 collateralizationRatio) {
        UserPosition memory position = userPositions[user];
        ethCollateral = position.ethCollateral;
        tghsxMinted = position.tghsxMinted;
        collateralizationRatio = _calculateCollateralizationRatio(uint128(ethCollateral), uint128(tghsxMinted));
    }

    // --- Internal Helpers ---
    function _calculateCollateralizationRatio(uint128 ethCollateral, uint128 tghsxMinted) internal view returns (uint256) {
        if (tghsxMinted == 0) return type(uint256).max;
        
        uint256 ethGhsPrice = getEthGhsPrice();
        uint256 collateralValueGHS = (uint256(ethCollateral) * ethGhsPrice) / 1e18; // Convert from wei
        
        return (collateralValueGHS * RATIO_PRECISION) / uint256(tghsxMinted);
    }

    function _transferETH(address to, uint256 amount) internal {
        (bool success, ) = payable(to).call{value: amount}("");
        if (!success) revert TransferFailed();
    }

    // --- Receive Function ---
    receive() external payable whenNotPaused {
        if (msg.value > 0) {
            deposit();
        }
    }
}
