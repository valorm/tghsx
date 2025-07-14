// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

interface ITGHSXToken {
    function mint(address to, uint256 amount) external;
    function burnFrom(address from, uint256 amount) external;
    function decimals() external view returns (uint8);
    function balanceOf(address account) external view returns (uint256);
}

/**
 * @title CollateralVault - Polygon Optimized with Auto-Mint
 * @dev Vault contract for managing collateral and auto-minting tGHSX stablecoin
 */
contract CollateralVault is ReentrancyGuard, AccessControl, Pausable {
    using SafeERC20 for IERC20;
    
    bytes32 public constant VAULT_ADMIN_ROLE = keccak256("VAULT_ADMIN_ROLE");
    bytes32 public constant LIQUIDATOR_ROLE = keccak256("LIQUIDATOR_ROLE");
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");
    bytes32 public constant EMERGENCY_ROLE = keccak256("EMERGENCY_ROLE");
    
    uint256 public constant PRECISION = 10**6;
    uint256 public constant MIN_COLLATERAL_RATIO = 150 * PRECISION / 100;
    uint256 public constant LIQUIDATION_THRESHOLD = 125 * PRECISION / 100;
    uint256 public constant LIQUIDATION_PENALTY = 10 * PRECISION / 100;
    uint256 public constant MIN_DEPOSIT_AMOUNT = 1 * 10**6;
    uint256 public constant MAX_SINGLE_MINT = 1000 * PRECISION;
    uint256 public constant MIN_MINT_AMOUNT = 1 * PRECISION;
    
    uint256 public constant MAX_MINT_PER_DAY = 5000 * PRECISION;
    uint256 public constant COOLDOWN = 300;
    uint256 public constant GLOBAL_DAILY_LIMIT = 100000 * PRECISION;
    uint256 public constant MAX_MINTS_PER_USER_PER_DAY = 20;
    
    ITGHSXToken public immutable tghsxToken;
    
    struct CollateralConfig {
        bool enabled;
        uint128 price;
        uint64 lastPriceUpdate;
        uint32 maxLTV;
        uint32 liquidationBonus;
        uint8 decimals;
    }
    
    // CORRECTED: Use uint256 to support 18-decimal tokens
    struct UserPosition {
        uint256 collateralAmount;
        uint256 mintedAmount;
        uint32 lastUpdateTime;
        uint32 positionId;
    }
    
    struct UserMintData {
        uint128 dailyMinted;
        uint64 lastMintTime;
        uint32 dailyMintCount;
        uint32 lastMintDay;
    }
    
    struct AutoMintConfig {
        uint64 baseReward;
        uint64 bonusMultiplier;
        uint32 minHoldTime;
        uint32 collateralRequirement;
    }
    
    mapping(address => CollateralConfig) public collateralConfigs;
    mapping(address => mapping(address => UserPosition)) public userPositions;
    mapping(address => UserMintData) public userMintData;
    mapping(address => bool) public authorizedCollaterals;
    
    uint256 public totalMintedGlobal;
    uint256 public globalDailyMinted;
    uint32 public currentDay;
    bool public autoMintEnabled;
    AutoMintConfig public autoMintConfig;
    
    address[] public collateralTokens;
    
    event CollateralDeposited(address indexed user, address indexed collateral, uint256 amount);
    event CollateralWithdrawn(address indexed user, address indexed collateral, uint256 amount);
    event TokensMinted(address indexed user, address indexed collateral, uint256 amount);
    event TokensBurned(address indexed user, address indexed collateral, uint256 amount);
    event AutoMintExecuted(address indexed user, uint256 amount, uint256 bonus);
    event PositionLiquidated(address indexed user, address indexed collateral, uint256 collateralAmount, uint256 debtAmount);
    event CollateralConfigUpdated(address indexed collateral, uint128 price, uint32 maxLTV, uint8 decimals);
    event PriceUpdated(address indexed collateral, uint128 oldPrice, uint128 newPrice);
    event AntiAbuseTriggered(address indexed user, string reason);
    event EmergencyAction(string action, address indexed target);
    
    error CollateralNotEnabled();
    error InsufficientCollateral();
    error BelowMinimumRatio();
    error ExceedsMaxMint();
    error InvalidAmount();
    error PriceStale();
    error AutoMintDisabled();
    error ExceedsDailyLimit();
    error CooldownNotMet();
    error ExceedsGlobalLimit();
    error ExceedsMaxMintsPerDay();
    error InsufficientCollateralForAutoMint();
    error NotLiquidatable();
    error InvalidCollateral();
    error PositionNotFound();
    
    modifier onlyAuthorizedCollateral(address collateral) {
        if (!authorizedCollaterals[collateral]) revert InvalidCollateral();
        _;
    }
    
    modifier antiAbuse(address user, uint256 amount) {
        if (amount < MIN_MINT_AMOUNT) revert InvalidAmount();
        if (amount > MAX_SINGLE_MINT) revert ExceedsMaxMint();
        
        _checkAndUpdateUserLimits(user, amount);
        _;
    }
    
    modifier validPrice(address collateral) {
        CollateralConfig memory config = collateralConfigs[collateral];
        if (config.price == 0) revert PriceStale();
        if (block.timestamp - config.lastPriceUpdate > 3600) revert PriceStale();
        _;
    }
    
    constructor(address _tghsxToken) {
        tghsxToken = ITGHSXToken(_tghsxToken);
        
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(VAULT_ADMIN_ROLE, msg.sender);
        _grantRole(EMERGENCY_ROLE, msg.sender);
        
        autoMintConfig = AutoMintConfig({
            baseReward: uint64(10 * PRECISION),
            bonusMultiplier: 500,
            minHoldTime: 3600,
            collateralRequirement: uint32(200 * PRECISION / 100)
        });
        
        currentDay = uint32(block.timestamp / 86400);
        autoMintEnabled = true;
    }
    
    function addCollateral(
        address collateral,
        uint128 initialPrice,
        uint32 maxLTV,
        uint32 liquidationBonus,
        uint8 _decimals
    ) external onlyRole(VAULT_ADMIN_ROLE) {
        require(maxLTV <= 9000, "Max LTV too high");
        require(liquidationBonus <= 2000, "Liquidation bonus too high");
        
        if (!authorizedCollaterals[collateral]) {
            authorizedCollaterals[collateral] = true;
            collateralTokens.push(collateral);
        }
        
        collateralConfigs[collateral] = CollateralConfig({
            enabled: true,
            price: initialPrice,
            lastPriceUpdate: uint64(block.timestamp),
            maxLTV: maxLTV,
            liquidationBonus: liquidationBonus,
            decimals: _decimals
        });
        
        emit CollateralConfigUpdated(collateral, initialPrice, maxLTV, _decimals);
    }
    
    function updatePrice(address collateral, uint128 newPrice) 
        external 
        onlyRole(ORACLE_ROLE) 
        onlyAuthorizedCollateral(collateral) 
    {
        CollateralConfig storage config = collateralConfigs[collateral];
        uint128 oldPrice = config.price;
        config.price = newPrice;
        config.lastPriceUpdate = uint64(block.timestamp);
        
        emit PriceUpdated(collateral, oldPrice, newPrice);
    }
    
    function depositCollateral(address collateral, uint256 amount) 
        external 
        nonReentrant 
        whenNotPaused 
        onlyAuthorizedCollateral(collateral)
    {
        // Check against MIN_DEPOSIT_AMOUNT is tricky with varying decimals.
        // A simple check is to ensure amount > 0.
        if (amount == 0) revert InvalidAmount();
        
        UserPosition storage position = userPositions[msg.sender][collateral];
        
        IERC20(collateral).safeTransferFrom(msg.sender, address(this), amount);
        
        position.collateralAmount += amount; // No longer needs casting
        position.lastUpdateTime = uint32(block.timestamp);
        
        if (position.positionId == 0) {
            position.positionId = uint32(block.timestamp);
        }
        
        emit CollateralDeposited(msg.sender, collateral, amount);
    }
    
    function withdrawCollateral(address collateral, uint256 amount) 
        external 
        nonReentrant 
        whenNotPaused 
        onlyAuthorizedCollateral(collateral)
        validPrice(collateral)
    {
        UserPosition storage position = userPositions[msg.sender][collateral];
        
        if (position.collateralAmount < amount) revert InsufficientCollateral();
        
        if (position.mintedAmount > 0) {
            uint256 remainingCollateral = position.collateralAmount - amount;
            uint256 collateralValue = _getCollateralValue(collateral, remainingCollateral);
            uint256 requiredCollateral = (position.mintedAmount * MIN_COLLATERAL_RATIO) / PRECISION;
            
            if (collateralValue < requiredCollateral) revert BelowMinimumRatio();
        }
        
        position.collateralAmount -= amount;
        position.lastUpdateTime = uint32(block.timestamp);
        
        IERC20(collateral).safeTransfer(msg.sender, amount);
        
        emit CollateralWithdrawn(msg.sender, collateral, amount);
    }
    
    function mintTokens(address collateral, uint256 amount) 
        external 
        nonReentrant 
        whenNotPaused 
        onlyAuthorizedCollateral(collateral)
        validPrice(collateral)
        antiAbuse(msg.sender, amount)
    {
        UserPosition storage position = userPositions[msg.sender][collateral];
        
        if (position.collateralAmount == 0) revert InsufficientCollateral();
        
        uint256 collateralValue = _getCollateralValue(collateral, position.collateralAmount);
        uint256 newMintedAmount = position.mintedAmount + amount;
        uint256 requiredCollateral = (newMintedAmount * MIN_COLLATERAL_RATIO) / PRECISION;
        
        if (collateralValue < requiredCollateral) revert BelowMinimumRatio();
        
        position.mintedAmount += amount;
        position.lastUpdateTime = uint32(block.timestamp);
        
        totalMintedGlobal += amount;
        globalDailyMinted += amount;
        
        tghsxToken.mint(msg.sender, amount);
        
        emit TokensMinted(msg.sender, collateral, amount);
    }
    
    function autoMint(address collateral) 
        external 
        nonReentrant 
        whenNotPaused 
        onlyAuthorizedCollateral(collateral)
        validPrice(collateral)
        antiAbuse(msg.sender, autoMintConfig.baseReward)
    {
        if (!autoMintEnabled) revert AutoMintDisabled();
        
        UserPosition storage position = userPositions[msg.sender][collateral];
        UserMintData storage mintData = userMintData[msg.sender];
        
        if (position.collateralAmount == 0) revert InsufficientCollateral();
        
        uint256 collateralValue = _getCollateralValue(collateral, position.collateralAmount);
        uint256 currentDebt = position.mintedAmount;
        uint256 currentRatio = currentDebt == 0 ? type(uint256).max : (collateralValue * PRECISION) / currentDebt;
        
        if (currentRatio < autoMintConfig.collateralRequirement) revert InsufficientCollateralForAutoMint();
        
        uint256 reward = autoMintConfig.baseReward;
        uint256 bonus = 0;
        
        if (tghsxToken.balanceOf(msg.sender) > 0 && mintData.lastMintTime > 0) {
            uint256 holdTime = block.timestamp - mintData.lastMintTime;
            if (holdTime >= autoMintConfig.minHoldTime) {
                bonus = (reward * autoMintConfig.bonusMultiplier) / 10000;
                reward += bonus;
            }
        }
        
        uint256 newMintedAmount = position.mintedAmount + reward;
        uint256 requiredCollateral = (newMintedAmount * MIN_COLLATERAL_RATIO) / PRECISION;
        
        if (collateralValue < requiredCollateral) revert BelowMinimumRatio();
        
        position.mintedAmount += reward;
        position.lastUpdateTime = uint32(block.timestamp);
        
        totalMintedGlobal += reward;
        globalDailyMinted += reward;
        
        tghsxToken.mint(msg.sender, reward);
        
        emit AutoMintExecuted(msg.sender, reward, bonus);
    }
    
    function burnTokens(address collateral, uint256 amount) 
        external 
        nonReentrant 
        whenNotPaused 
        onlyAuthorizedCollateral(collateral)
    {
        UserPosition storage position = userPositions[msg.sender][collateral];
        
        if (position.mintedAmount < amount) revert InvalidAmount();
        
        position.mintedAmount -= amount;
        position.lastUpdateTime = uint32(block.timestamp);
        
        totalMintedGlobal -= amount;
        
        tghsxToken.burnFrom(msg.sender, amount);
        
        emit TokensBurned(msg.sender, collateral, amount);
    }
    
    function liquidate(address user, address collateral) 
        external 
        nonReentrant 
        whenNotPaused 
        onlyRole(LIQUIDATOR_ROLE)
        onlyAuthorizedCollateral(collateral)
        validPrice(collateral)
    {
        _executeLiquidation(user, collateral);
    }
    
    function _executeLiquidation(address user, address collateral) internal {
        UserPosition storage position = userPositions[user][collateral];
        
        if (position.collateralAmount == 0 || position.mintedAmount == 0) revert PositionNotFound();
        
        uint256 collateralValue = _getCollateralValue(collateral, position.collateralAmount);
        uint256 collateralRatio = (collateralValue * PRECISION) / position.mintedAmount;
        
        if (collateralRatio >= LIQUIDATION_THRESHOLD) revert NotLiquidatable();
        
        uint256 liquidationBonus = (position.collateralAmount * collateralConfigs[collateral].liquidationBonus) / 10000;
        
        uint256 collateralToTransfer = position.collateralAmount + liquidationBonus;
        uint256 debtToBurn = position.mintedAmount;
        
        totalMintedGlobal -= position.mintedAmount;
        
        emit PositionLiquidated(user, collateral, position.collateralAmount, position.mintedAmount);
        
        delete userPositions[user][collateral];
        
        IERC20(collateral).safeTransfer(msg.sender, collateralToTransfer);
        
        tghsxToken.burnFrom(msg.sender, debtToBurn);
    }
    
    function _checkAndUpdateUserLimits(address user, uint256 amount) internal {
        UserMintData storage mintData = userMintData[user];
        uint32 today = uint32(block.timestamp / 86400);
        
        if (today != mintData.lastMintDay) {
            mintData.dailyMinted = 0;
            mintData.dailyMintCount = 0;
            mintData.lastMintDay = today;
        }
        
        if (today != currentDay) {
            globalDailyMinted = 0;
            currentDay = today;
        }
        
        if (block.timestamp - mintData.lastMintTime < COOLDOWN) {
            emit AntiAbuseTriggered(user, "Cooldown not met");
            revert CooldownNotMet();
        }
        
        if (mintData.dailyMinted + uint128(amount) > MAX_MINT_PER_DAY) {
            emit AntiAbuseTriggered(user, "Daily limit exceeded");
            revert ExceedsDailyLimit();
        }
        
        if (globalDailyMinted + amount > GLOBAL_DAILY_LIMIT) {
            emit AntiAbuseTriggered(user, "Global daily limit exceeded");
            revert ExceedsGlobalLimit();
        }
        
        if (mintData.dailyMintCount >= MAX_MINTS_PER_USER_PER_DAY) {
            emit AntiAbuseTriggered(user, "Max mints per day exceeded");
            revert ExceedsMaxMintsPerDay();
        }
        
        mintData.dailyMinted += uint128(amount);
        mintData.lastMintTime = uint64(block.timestamp);
        mintData.dailyMintCount++;
    }
    
    function _getCollateralValue(address collateral, uint256 amount) internal view returns (uint256) {
        CollateralConfig memory config = collateralConfigs[collateral];
        return (amount * config.price) / (10**config.decimals);
    }
    
    function getUserPosition(address user, address collateral) 
        external 
        view 
        returns (
            uint256 collateralAmount,
            uint256 mintedAmount,
            uint256 collateralValue,
            uint256 collateralRatio,
            bool isLiquidatable,
            uint256 lastUpdateTime
        ) 
    {
        UserPosition memory position = userPositions[user][collateral];
        
        collateralAmount = position.collateralAmount;
        mintedAmount = position.mintedAmount;
        
        if (collateralAmount > 0) {
            collateralValue = _getCollateralValue(collateral, collateralAmount);
            if (mintedAmount > 0) {
                collateralRatio = (collateralValue * PRECISION) / mintedAmount;
                isLiquidatable = collateralRatio < LIQUIDATION_THRESHOLD;
            } else {
                collateralRatio = type(uint256).max;
                isLiquidatable = false;
            }
        }
        
        lastUpdateTime = position.lastUpdateTime;
    }
    
    function getUserMintStatus(address user) 
        external 
        view 
        returns (
            uint256 dailyMinted,
            uint256 remainingDaily,
            uint256 lastMintTime,
            uint256 cooldownRemaining,
            uint256 dailyMintCount,
            uint256 remainingMints
        ) 
    {
        UserMintData memory mintData = userMintData[user];
        uint32 today = uint32(block.timestamp / 86400);
        
        if (today != mintData.lastMintDay) {
            dailyMinted = 0;
            dailyMintCount = 0;
        } else {
            dailyMinted = mintData.dailyMinted;
            dailyMintCount = mintData.dailyMintCount;
        }
        
        remainingDaily = MAX_MINT_PER_DAY > dailyMinted ? MAX_MINT_PER_DAY - dailyMinted : 0;
        lastMintTime = mintData.lastMintTime;
        
        uint256 timeSinceLastMint = block.timestamp - mintData.lastMintTime;
        cooldownRemaining = timeSinceLastMint >= COOLDOWN ? 0 : COOLDOWN - timeSinceLastMint;
        
        remainingMints = dailyMintCount >= MAX_MINTS_PER_USER_PER_DAY ? 
            0 : MAX_MINTS_PER_USER_PER_DAY - dailyMintCount;
    }
    
    function getVaultStatus() 
        external 
        view 
        returns (
            uint256 totalMinted,
            uint256 dailyMinted,
            uint256 globalDailyRemaining,
            bool autoMintActive,
            bool contractPaused,
            uint256 totalCollateralTypes
        ) 
    {
        uint32 today = uint32(block.timestamp / 86400);
        
        totalMinted = totalMintedGlobal;
        
        if (today != currentDay) {
            dailyMinted = 0;
        } else {
            dailyMinted = globalDailyMinted;
        }
        
        globalDailyRemaining = GLOBAL_DAILY_LIMIT > dailyMinted ? 
            GLOBAL_DAILY_LIMIT - dailyMinted : 0;
        autoMintActive = autoMintEnabled;
        contractPaused = paused();
        totalCollateralTypes = collateralTokens.length;
    }
    
    function updateAutoMintConfig(
        uint64 baseReward,
        uint64 bonusMultiplier,
        uint32 minHoldTime,
        uint32 collateralRequirement
    ) external onlyRole(VAULT_ADMIN_ROLE) {
        require(baseReward > 0 && baseReward <= MAX_SINGLE_MINT, "Invalid base reward");
        require(bonusMultiplier <= 5000, "Bonus too high");
        require(minHoldTime <= 86400, "Hold time too long");
        require(collateralRequirement >= MIN_COLLATERAL_RATIO, "Collateral requirement too low");
        
        autoMintConfig = AutoMintConfig({
            baseReward: baseReward,
            bonusMultiplier: bonusMultiplier,
            minHoldTime: minHoldTime,
            collateralRequirement: collateralRequirement
        });
    }
    
    function toggleAutoMint(bool enabled) external onlyRole(VAULT_ADMIN_ROLE) {
        autoMintEnabled = enabled;
    }
    
    function emergencyPause() external onlyRole(EMERGENCY_ROLE) {
        _pause();
        emit EmergencyAction("Pause", address(this));
    }
    
    function emergencyUnpause() external onlyRole(EMERGENCY_ROLE) {
        _unpause();
        emit EmergencyAction("Unpause", address(this));
    }
    
    function emergencyResetUserLimits(address user) external onlyRole(EMERGENCY_ROLE) {
        delete userMintData[user];
        emit AntiAbuseTriggered(user, "Emergency reset");
    }
    
    function emergencyResetGlobalLimits() external onlyRole(EMERGENCY_ROLE) {
        globalDailyMinted = 0;
        currentDay = uint32(block.timestamp / 86400);
        emit EmergencyAction("Global limits reset", address(this));
    }
    
    function getAllCollateralTokens() external view returns (address[] memory) {
        return collateralTokens;
    }
    
    function batchLiquidate(address[] calldata users, address[] calldata collaterals) 
        external 
        onlyRole(LIQUIDATOR_ROLE) 
    {
        require(users.length == collaterals.length, "Array length mismatch");
        require(users.length <= 10, "Batch size too large");
        
        for (uint256 i = 0; i < users.length; i++) {
            _executeLiquidation(users[i], collaterals[i]);
        }
    }
}
