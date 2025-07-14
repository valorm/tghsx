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
 * Features:
 * - 6 decimal precision optimization for Polygon
 * - Auto-mint functionality with comprehensive abuse protection
 * - Rate limiting and daily caps per user
 * - Multiple collateral token support
 * - Emergency controls and liquidation mechanisms
 * - Gas-optimized operations for Polygon network
 */
contract CollateralVault is ReentrancyGuard, AccessControl, Pausable {
    using SafeERC20 for IERC20;
    
    // Role definitions
    bytes32 public constant VAULT_ADMIN_ROLE = keccak256("VAULT_ADMIN_ROLE");
    bytes32 public constant LIQUIDATOR_ROLE = keccak256("LIQUIDATOR_ROLE");
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");
    bytes32 public constant EMERGENCY_ROLE = keccak256("EMERGENCY_ROLE");
    
    // Constants optimized for Polygon (6 decimals)
    uint256 public constant PRECISION = 10**6;
    uint256 public constant MIN_COLLATERAL_RATIO = 150 * PRECISION / 100; // 150%
    uint256 public constant LIQUIDATION_THRESHOLD = 125 * PRECISION / 100; // 125%
    uint256 public constant LIQUIDATION_PENALTY = 10 * PRECISION / 100; // 10%
    uint256 public constant MIN_DEPOSIT_AMOUNT = 1 * PRECISION; // 1 unit minimum
    uint256 public constant MAX_SINGLE_MINT = 1000 * PRECISION; // 1000 tGHSX per mint
    uint256 public constant MIN_MINT_AMOUNT = 1 * PRECISION; // 1 tGHSX minimum
    
    // Anti-abuse protection constants
    uint256 public constant MAX_MINT_PER_DAY = 5000 * PRECISION; // 5000 tGHSX per day per user
    uint256 public constant COOLDOWN = 300; // 5 minutes between mints
    uint256 public constant GLOBAL_DAILY_LIMIT = 100000 * PRECISION; // 100k tGHSX per day globally
    uint256 public constant MAX_MINTS_PER_USER_PER_DAY = 20; // Max 20 mints per user per day
    
    // State variables
    ITGHSXToken public immutable tghsxToken;
    
    // Collateral configuration
    struct CollateralConfig {
        bool enabled;
        uint128 price; // Price in USD with 6 decimals
        uint64 lastPriceUpdate;
        uint32 maxLTV; // Max loan-to-value ratio (basis points)
        uint32 liquidationBonus; // Bonus for liquidators (basis points)
    }
    
    // User position data (packed for gas efficiency)
    struct UserPosition {
        uint128 collateralAmount;
        uint128 mintedAmount;
        uint32 lastUpdateTime;
        uint32 positionId;
    }
    
    // Anti-abuse tracking (packed for gas efficiency)
    struct UserMintData {
        uint128 dailyMinted;
        uint64 lastMintTime;
        uint32 dailyMintCount;
        uint32 lastMintDay;
    }
    
    // Auto-mint configuration
    struct AutoMintConfig {
        uint64 baseReward;
        uint64 bonusMultiplier;
        uint32 minHoldTime;
        uint32 collateralRequirement; // Minimum collateral ratio for auto-mint
    }
    
    // Storage mappings
    mapping(address => CollateralConfig) public collateralConfigs;
    mapping(address => mapping(address => UserPosition)) public userPositions; // user => collateral => position
    mapping(address => UserMintData) public userMintData;
    mapping(address => bool) public authorizedCollaterals;
    
    // Global state
    uint256 public totalMintedGlobal;
    uint256 public globalDailyMinted;
    uint32 public currentDay;
    bool public autoMintEnabled;
    AutoMintConfig public autoMintConfig;
    
    // Arrays for iteration
    address[] public collateralTokens;
    
    // Events
    event CollateralDeposited(address indexed user, address indexed collateral, uint256 amount);
    event CollateralWithdrawn(address indexed user, address indexed collateral, uint256 amount);
    event TokensMinted(address indexed user, address indexed collateral, uint256 amount);
    event TokensBurned(address indexed user, address indexed collateral, uint256 amount);
    event AutoMintExecuted(address indexed user, uint256 amount, uint256 bonus);
    event PositionLiquidated(address indexed user, address indexed collateral, uint256 collateralAmount, uint256 debtAmount);
    event CollateralConfigUpdated(address indexed collateral, uint128 price, uint32 maxLTV);
    event PriceUpdated(address indexed collateral, uint128 oldPrice, uint128 newPrice);
    event AntiAbuseTriggered(address indexed user, string reason);
    event EmergencyAction(string action, address indexed target);
    
    // Custom errors
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
    
    // Modifiers
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
        if (block.timestamp - config.lastPriceUpdate > 3600) revert PriceStale(); // 1 hour max
        _;
    }
    
    /**
     * @dev Constructor
     */
    constructor(address _tghsxToken) {
        tghsxToken = ITGHSXToken(_tghsxToken);
        
        // Grant roles to deployer
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(VAULT_ADMIN_ROLE, msg.sender);
        _grantRole(EMERGENCY_ROLE, msg.sender);
        
        // Initialize auto-mint configuration - FIX: Explicit type casting
        autoMintConfig = AutoMintConfig({
            baseReward: uint64(10 * PRECISION),
            bonusMultiplier: 500, // 5% bonus
            minHoldTime: 3600, // 1 hour
            collateralRequirement: uint32(200 * PRECISION / 100) // 200% collateral ratio required
        });
        
        currentDay = uint32(block.timestamp / 86400);
        autoMintEnabled = true;
    }
    
    /**
     * @dev Add or update collateral configuration
     */
    function addCollateral(
        address collateral,
        uint128 initialPrice,
        uint32 maxLTV,
        uint32 liquidationBonus
    ) external onlyRole(VAULT_ADMIN_ROLE) {
        require(maxLTV <= 9000, "Max LTV too high"); // Max 90%
        require(liquidationBonus <= 2000, "Liquidation bonus too high"); // Max 20%
        
        if (!authorizedCollaterals[collateral]) {
            authorizedCollaterals[collateral] = true;
            collateralTokens.push(collateral);
        }
        
        collateralConfigs[collateral] = CollateralConfig({
            enabled: true,
            price: initialPrice,
            lastPriceUpdate: uint64(block.timestamp),
            maxLTV: maxLTV,
            liquidationBonus: liquidationBonus
        });
        
        emit CollateralConfigUpdated(collateral, initialPrice, maxLTV);
    }
    
    /**
     * @dev Update collateral price
     */
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
    
    /**
     * @dev Deposit collateral
     */
    function depositCollateral(address collateral, uint256 amount) 
        external 
        nonReentrant 
        whenNotPaused 
        onlyAuthorizedCollateral(collateral)
    {
        if (amount < MIN_DEPOSIT_AMOUNT) revert InvalidAmount();
        
        UserPosition storage position = userPositions[msg.sender][collateral];
        
        // Transfer collateral from user
        IERC20(collateral).safeTransferFrom(msg.sender, address(this), amount);
        
        // Update position
        position.collateralAmount += uint128(amount);
        position.lastUpdateTime = uint32(block.timestamp);
        
        // Assign position ID if first deposit
        if (position.positionId == 0) {
            position.positionId = uint32(block.timestamp);
        }
        
        emit CollateralDeposited(msg.sender, collateral, amount);
    }
    
    /**
     * @dev Withdraw collateral
     */
    function withdrawCollateral(address collateral, uint256 amount) 
        external 
        nonReentrant 
        whenNotPaused 
        onlyAuthorizedCollateral(collateral)
        validPrice(collateral)
    {
        UserPosition storage position = userPositions[msg.sender][collateral];
        
        if (position.collateralAmount < amount) revert InsufficientCollateral();
        
        // Check if withdrawal would put position below minimum ratio
        if (position.mintedAmount > 0) {
            uint256 remainingCollateral = position.collateralAmount - amount;
            uint256 collateralValue = _getCollateralValue(collateral, remainingCollateral);
            uint256 requiredCollateral = (position.mintedAmount * MIN_COLLATERAL_RATIO) / PRECISION;
            
            if (collateralValue < requiredCollateral) revert BelowMinimumRatio();
        }
        
        // Update position
        position.collateralAmount -= uint128(amount);
        position.lastUpdateTime = uint32(block.timestamp);
        
        // Transfer collateral to user
        IERC20(collateral).safeTransfer(msg.sender, amount);
        
        emit CollateralWithdrawn(msg.sender, collateral, amount);
    }
    
    /**
     * @dev Mint tGHSX tokens against collateral
     */
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
        
        // Check collateral ratio
        uint256 collateralValue = _getCollateralValue(collateral, position.collateralAmount);
        uint256 newMintedAmount = position.mintedAmount + amount;
        uint256 requiredCollateral = (newMintedAmount * MIN_COLLATERAL_RATIO) / PRECISION;
        
        if (collateralValue < requiredCollateral) revert BelowMinimumRatio();
        
        // Update position
        position.mintedAmount += uint128(amount);
        position.lastUpdateTime = uint32(block.timestamp);
        
        // Update global tracking
        totalMintedGlobal += amount;
        globalDailyMinted += amount;
        
        // Mint tokens
        tghsxToken.mint(msg.sender, amount);
        
        emit TokensMinted(msg.sender, collateral, amount);
    }
    
    /**
     * @dev Auto-mint function with bonus rewards
     */
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
        
        // Check minimum collateral ratio for auto-mint
        uint256 collateralValue = _getCollateralValue(collateral, position.collateralAmount);
        uint256 currentDebt = position.mintedAmount;
        uint256 currentRatio = currentDebt == 0 ? type(uint256).max : (collateralValue * PRECISION) / currentDebt;
        
        if (currentRatio < autoMintConfig.collateralRequirement) revert InsufficientCollateralForAutoMint();
        
        // Calculate reward with potential bonus
        uint256 reward = autoMintConfig.baseReward;
        uint256 bonus = 0;
        
        // Check for holding bonus
        if (tghsxToken.balanceOf(msg.sender) > 0 && mintData.lastMintTime > 0) {
            uint256 holdTime = block.timestamp - mintData.lastMintTime;
            if (holdTime >= autoMintConfig.minHoldTime) {
                bonus = (reward * autoMintConfig.bonusMultiplier) / 10000;
                reward += bonus;
            }
        }
        
        // Final collateral ratio check with reward
        uint256 newMintedAmount = position.mintedAmount + reward;
        uint256 requiredCollateral = (newMintedAmount * MIN_COLLATERAL_RATIO) / PRECISION;
        
        if (collateralValue < requiredCollateral) revert BelowMinimumRatio();
        
        // Update position
        position.mintedAmount += uint128(reward);
        position.lastUpdateTime = uint32(block.timestamp);
        
        // Update global tracking
        totalMintedGlobal += reward;
        globalDailyMinted += reward;
        
        // Mint tokens
        tghsxToken.mint(msg.sender, reward);
        
        emit AutoMintExecuted(msg.sender, reward, bonus);
    }
    
    /**
     * @dev Burn tGHSX tokens to reduce debt
     */
    function burnTokens(address collateral, uint256 amount) 
        external 
        nonReentrant 
        whenNotPaused 
        onlyAuthorizedCollateral(collateral)
    {
        UserPosition storage position = userPositions[msg.sender][collateral];
        
        if (position.mintedAmount < amount) revert InvalidAmount();
        
        // Update position
        position.mintedAmount -= uint128(amount);
        position.lastUpdateTime = uint32(block.timestamp);
        
        // Update global tracking
        totalMintedGlobal -= amount;
        
        // Burn tokens
        tghsxToken.burnFrom(msg.sender, amount);
        
        emit TokensBurned(msg.sender, collateral, amount);
    }
    
    /**
     * @dev Liquidate undercollateralized position - FIXED: Reduced local variables
     */
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
    
    /**
     * @dev Internal liquidation logic to avoid stack too deep
     */
    function _executeLiquidation(address user, address collateral) internal {
        UserPosition storage position = userPositions[user][collateral];
        
        if (position.collateralAmount == 0 || position.mintedAmount == 0) revert PositionNotFound();
        
        // Check if position is liquidatable
        uint256 collateralValue = _getCollateralValue(collateral, position.collateralAmount);
        uint256 collateralRatio = (collateralValue * PRECISION) / position.mintedAmount;
        
        if (collateralRatio >= LIQUIDATION_THRESHOLD) revert NotLiquidatable();
        
        // Calculate liquidation bonus
        uint256 liquidationBonus = (position.collateralAmount * collateralConfigs[collateral].liquidationBonus) / 10000;
        
        // Store values before clearing position
        uint256 collateralToTransfer = position.collateralAmount + liquidationBonus;
        uint256 debtToBurn = position.mintedAmount;
        
        // Update global tracking
        totalMintedGlobal -= position.mintedAmount;
        
        // Emit event before clearing position
        emit PositionLiquidated(user, collateral, position.collateralAmount, position.mintedAmount);
        
        // Clear position
        delete userPositions[user][collateral];
        
        // Transfer collateral to liquidator
        IERC20(collateral).safeTransfer(msg.sender, collateralToTransfer);
        
        // Burn debt tokens from liquidator
        tghsxToken.burnFrom(msg.sender, debtToBurn);
    }
    
    /**
     * @dev Internal function to check and update user limits
     */
    function _checkAndUpdateUserLimits(address user, uint256 amount) internal {
        UserMintData storage mintData = userMintData[user];
        uint32 today = uint32(block.timestamp / 86400);
        
        // Reset daily data if new day
        if (today != mintData.lastMintDay) {
            mintData.dailyMinted = 0;
            mintData.dailyMintCount = 0;
            mintData.lastMintDay = today;
        }
        
        // Reset global daily data if new day
        if (today != currentDay) {
            globalDailyMinted = 0;
            currentDay = today;
        }
        
        // Check cooldown
        if (block.timestamp - mintData.lastMintTime < COOLDOWN) {
            emit AntiAbuseTriggered(user, "Cooldown not met");
            revert CooldownNotMet();
        }
        
        // Check daily user limit
        if (mintData.dailyMinted + amount > MAX_MINT_PER_DAY) {
            emit AntiAbuseTriggered(user, "Daily limit exceeded");
            revert ExceedsDailyLimit();
        }
        
        // Check global daily limit
        if (globalDailyMinted + amount > GLOBAL_DAILY_LIMIT) {
            emit AntiAbuseTriggered(user, "Global daily limit exceeded");
            revert ExceedsGlobalLimit();
        }
        
        // Check max mints per day
        if (mintData.dailyMintCount >= MAX_MINTS_PER_USER_PER_DAY) {
            emit AntiAbuseTriggered(user, "Max mints per day exceeded");
            revert ExceedsMaxMintsPerDay();
        }
        
        // Update mint data
        mintData.dailyMinted += uint128(amount);
        mintData.lastMintTime = uint64(block.timestamp);
        mintData.dailyMintCount++;
    }
    
    /**
     * @dev Calculate collateral value in USD
     */
    function _getCollateralValue(address collateral, uint256 amount) internal view returns (uint256) {
        CollateralConfig memory config = collateralConfigs[collateral];
        return (amount * config.price) / PRECISION;
    }
    
    /**
     * @dev Get user position details
     */
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
            collateralRatio = mintedAmount == 0 ? type(uint256).max : (collateralValue * PRECISION) / mintedAmount;
            isLiquidatable = collateralRatio < LIQUIDATION_THRESHOLD;
        }
        
        lastUpdateTime = position.lastUpdateTime;
    }
    
    /**
     * @dev Get user mint status
     */
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
        
        // Reset values if new day
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
    
   /**
 * @dev Get global vault status
 */
function getVaultStatus() 
    external 
    view 
    returns (
        uint256 totalMinted,
        uint256 dailyMinted,
        uint256 globalDailyRemaining,
        bool autoMintActive,
        bool contractPaused,  // FIX: Renamed to avoid collision
        uint256 totalCollateralTypes
    ) 
{
    uint32 today = uint32(block.timestamp / 86400);
    
    totalMinted = totalMintedGlobal;
    
    // Reset if new day
    if (today != currentDay) {
        dailyMinted = 0;
    } else {
        dailyMinted = globalDailyMinted;
    }
    
    globalDailyRemaining = GLOBAL_DAILY_LIMIT > dailyMinted ? 
        GLOBAL_DAILY_LIMIT - dailyMinted : 0;
    autoMintActive = autoMintEnabled;
    contractPaused = paused();  // FIX: Now correctly calls the function
    totalCollateralTypes = collateralTokens.length;
}
    
    /**
     * @dev Update auto-mint configuration
     */
    function updateAutoMintConfig(
        uint64 baseReward,
        uint64 bonusMultiplier,
        uint32 minHoldTime,
        uint32 collateralRequirement
    ) external onlyRole(VAULT_ADMIN_ROLE) {
        require(baseReward > 0 && baseReward <= MAX_SINGLE_MINT, "Invalid base reward");
        require(bonusMultiplier <= 5000, "Bonus too high"); // Max 50%
        require(minHoldTime <= 86400, "Hold time too long"); // Max 24 hours
        require(collateralRequirement >= MIN_COLLATERAL_RATIO, "Collateral requirement too low");
        
        autoMintConfig = AutoMintConfig({
            baseReward: baseReward,
            bonusMultiplier: bonusMultiplier,
            minHoldTime: minHoldTime,
            collateralRequirement: collateralRequirement
        });
    }
    
    /**
     * @dev Toggle auto-mint functionality
     */
    function toggleAutoMint(bool enabled) external onlyRole(VAULT_ADMIN_ROLE) {
        autoMintEnabled = enabled;
    }
    
    /**
     * @dev Emergency pause
     */
    function emergencyPause() external onlyRole(EMERGENCY_ROLE) {
        _pause();
        emit EmergencyAction("Pause", address(this));
    }
    
    /**
     * @dev Emergency unpause
     */
    function emergencyUnpause() external onlyRole(EMERGENCY_ROLE) {
        _unpause();
        emit EmergencyAction("Unpause", address(this));
    }
    
    /**
     * @dev Emergency reset user limits
     */
    function emergencyResetUserLimits(address user) external onlyRole(EMERGENCY_ROLE) {
        delete userMintData[user];
        emit AntiAbuseTriggered(user, "Emergency reset");
    }
    
    /**
     * @dev Emergency reset global limits
     */
    function emergencyResetGlobalLimits() external onlyRole(EMERGENCY_ROLE) {
        globalDailyMinted = 0;
        currentDay = uint32(block.timestamp / 86400);
        emit EmergencyAction("Global limits reset", address(this));
    }
    
    /**
     * @dev Get all collateral tokens
     */
    function getAllCollateralTokens() external view returns (address[] memory) {
        return collateralTokens;
    }
    
    /**
     * @dev Batch liquidation for gas efficiency - FIXED: Simplified to avoid stack issues
     */
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