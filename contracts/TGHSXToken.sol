// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract TGHSXToken is ERC20, AccessControl, ERC20Burnable, ReentrancyGuard {
    bytes32 public constant MINTER_BURNER_ROLE = keccak256("MINTER_BURNER_ROLE");
    bytes32 public constant AUTO_MINTER_ROLE = keccak256("AUTO_MINTER_ROLE");
    bytes32 public constant EMERGENCY_ROLE = keccak256("EMERGENCY_ROLE");
    
    uint256 public constant MAX_MINT_PER_DAY = 1000 * 10**6;
    uint256 public constant COOLDOWN = 300;
    uint256 public constant MAX_SINGLE_MINT = 100 * 10**6;
    uint256 public constant MIN_MINT_AMOUNT = 1 * 10**6;
    uint256 public constant GLOBAL_DAILY_LIMIT = 10000 * 10**6;
    uint256 public constant MAX_SUPPLY = 1000000 * 10**6;
    
    bool public emergencyStop = false;
    bool public autoMintEnabled = false;
    
    struct UserMintData {
        uint128 dailyMinted;
        uint64 lastMintTime;
        uint32 dailyMintCount;
        uint32 lastMintDay;
    }
    
    mapping(address => UserMintData) public userMintData;
    uint256 public globalDailyMinted;
    uint32 public currentDay;
    
    struct AutoMintConfig {
        uint64 baseReward;
        uint64 bonusMultiplier;
        uint32 minHoldTime;
        uint32 maxMintsPerUser;
    }
    
    AutoMintConfig public autoMintConfig;
    
    event EmergencyStopToggled(bool status);
    event AutoMintToggled(bool status);
    event RoleBurning(address indexed from, uint256 amount, address indexed burner);
    event AutoMint(address indexed user, uint256 amount, uint256 bonus);
    event AntiAbuseTriggered(address indexed user, string reason);
    event ConfigUpdated(string parameter, uint256 oldValue, uint256 newValue);
    
    error EmergencyStopActive();
    error InvalidAmount();
    error AutoMintDisabled();
    error ExceedsDailyLimit();
    error ExceedsGlobalLimit();
    error CooldownNotMet();
    error ExceedsMaxSupply();
    error BelowMinimumAmount();
    error ExceedsSingleMintLimit();
    error ExceedsMaxMintsPerDay();
    error InvalidConfiguration();
    
    modifier onlyWhenAutoMintEnabled() {
        if (!autoMintEnabled) revert AutoMintDisabled();
        _;
    }
    
    modifier antiAbuse(address user, uint256 amount) {
        if (emergencyStop) revert EmergencyStopActive();
        if (amount == 0) revert InvalidAmount();
        if (amount < MIN_MINT_AMOUNT) revert BelowMinimumAmount();
        if (amount > MAX_SINGLE_MINT) revert ExceedsSingleMintLimit();
        _checkAndUpdateUserLimits(user, amount);
        _;
    }
    
    constructor() ERC20("tGHSX Stablecoin", "tGHSX") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(EMERGENCY_ROLE, msg.sender);
        
        autoMintConfig = AutoMintConfig({
            baseReward: 10 * 10**6,
            bonusMultiplier: 500,
            minHoldTime: 86400,
            maxMintsPerUser: 10
        });
        
        currentDay = uint32(block.timestamp / 86400);
    }
    
    function decimals() public view override returns (uint8) {
        return 6;
    }
    
    function mint(address to, uint256 amount) public virtual onlyRole(MINTER_BURNER_ROLE) {
        if (emergencyStop) revert EmergencyStopActive();
        if (amount == 0) revert InvalidAmount();
        if (totalSupply() + amount > MAX_SUPPLY) revert ExceedsMaxSupply();
        _mint(to, amount);
    }
    
    function autoMint() external nonReentrant onlyWhenAutoMintEnabled antiAbuse(msg.sender, autoMintConfig.baseReward) {
        address user = msg.sender;
        UserMintData storage userData = userMintData[user];
        if (userData.dailyMintCount >= autoMintConfig.maxMintsPerUser) {
            revert ExceedsMaxMintsPerDay();
        }
        
        uint256 reward = autoMintConfig.baseReward;
        uint256 bonus = 0;
        if (balanceOf(user) > 0 && userData.lastMintTime > 0) {
            uint256 holdTime = block.timestamp - userData.lastMintTime;
            if (holdTime >= autoMintConfig.minHoldTime) {
                bonus = (reward * autoMintConfig.bonusMultiplier) / 10000;
                reward += bonus;
            }
        }
        
        if (totalSupply() + reward > MAX_SUPPLY) revert ExceedsMaxSupply();
        if (globalDailyMinted + reward > GLOBAL_DAILY_LIMIT) revert ExceedsGlobalLimit();
        
        userData.dailyMinted += uint128(reward);
        userData.lastMintTime = uint64(block.timestamp);
        userData.dailyMintCount++;
        globalDailyMinted += reward;
        _mint(user, reward);
        emit AutoMint(user, reward, bonus);
    }
    
    function adminMint(address to, uint256 amount) external onlyRole(AUTO_MINTER_ROLE) antiAbuse(to, amount) {
        if (totalSupply() + amount > MAX_SUPPLY) revert ExceedsMaxSupply();
        if (globalDailyMinted + amount > GLOBAL_DAILY_LIMIT) revert ExceedsGlobalLimit();
        globalDailyMinted += amount;
        _mint(to, amount);
    }
    
    function burnFrom(address from, uint256 amount) public override {
        if (emergencyStop) revert EmergencyStopActive();
        if (amount == 0) revert InvalidAmount();
        if (hasRole(MINTER_BURNER_ROLE, msg.sender)) {
            _burn(from, amount);
            emit RoleBurning(from, amount, msg.sender);
        } else {
            super.burnFrom(from, amount);
        }
    }
    
    function roleBurn(address from, uint256 amount) external onlyRole(MINTER_BURNER_ROLE) {
        if (emergencyStop) revert EmergencyStopActive();
        if (amount == 0) revert InvalidAmount();
        _burn(from, amount);
        emit RoleBurning(from, amount, msg.sender);
    }
    
    function burn(uint256 amount) public override {
        if (emergencyStop) revert EmergencyStopActive();
        super.burn(amount);
    }
    
    function _checkAndUpdateUserLimits(address user, uint256 amount) internal {
        UserMintData storage userData = userMintData[user];
        uint32 today = uint32(block.timestamp / 86400);
        
        if (today != userData.lastMintDay) {
            userData.dailyMinted = 0;
            userData.dailyMintCount = 0;
            userData.lastMintDay = today;
        }
        
        if (today != currentDay) {
            globalDailyMinted = 0;
            currentDay = today;
        }
        
        if (block.timestamp - userData.lastMintTime < COOLDOWN) {
            emit AntiAbuseTriggered(user, "Cooldown not met");
            revert CooldownNotMet();
        }
        
        if (userData.dailyMinted + uint128(amount) > MAX_MINT_PER_DAY) {
            emit AntiAbuseTriggered(user, "Daily limit exceeded");
            revert ExceedsDailyLimit();
        }
    }
    
    function getUserMintStatus(address user) external view returns (uint256 dailyMinted, uint256 remainingDaily, uint256 lastMintTime, uint256 cooldownRemaining, uint256 dailyMintCount, uint256 remainingMints) {
        UserMintData memory userData = userMintData[user];
        uint32 today = uint32(block.timestamp / 86400);
        
        if (today != userData.lastMintDay) {
            dailyMinted = 0;
            dailyMintCount = 0;
        } else {
            dailyMinted = userData.dailyMinted;
            dailyMintCount = userData.dailyMintCount;
        }
        
        remainingDaily = MAX_MINT_PER_DAY > dailyMinted ? MAX_MINT_PER_DAY - dailyMinted : 0;
        lastMintTime = userData.lastMintTime;
        
        uint256 timeSinceLastMint = block.timestamp - userData.lastMintTime;
        cooldownRemaining = timeSinceLastMint >= COOLDOWN ? 0 : COOLDOWN - timeSinceLastMint;
        
        remainingMints = dailyMintCount >= autoMintConfig.maxMintsPerUser ? 0 : autoMintConfig.maxMintsPerUser - dailyMintCount;
    }
    
    function getGlobalMintStatus() external view returns (
        uint256 _globalDailyMinted,
        uint256 _globalDailyRemaining,
        uint256 _currentSupply,
        uint256 _maxSupply,
        uint256 _supplyRemaining
    ) {
        uint32 today = uint32(block.timestamp / 86400);
        
        if (today != currentDay) {
            _globalDailyMinted = 0;
        } else {
            _globalDailyMinted = globalDailyMinted;
        }
        
        _globalDailyRemaining = GLOBAL_DAILY_LIMIT > _globalDailyMinted ? GLOBAL_DAILY_LIMIT - _globalDailyMinted : 0;
        _currentSupply = totalSupply();
        _maxSupply = MAX_SUPPLY;
        _supplyRemaining = MAX_SUPPLY > _currentSupply ? MAX_SUPPLY - _currentSupply : 0;
    }
    
    function updateAutoMintConfig(uint64 baseReward, uint64 bonusMultiplier, uint32 minHoldTime, uint32 maxMintsPerUser) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (baseReward == 0 || baseReward > MAX_SINGLE_MINT) revert InvalidConfiguration();
        if (bonusMultiplier > 5000) revert InvalidConfiguration();
        if (minHoldTime > 86400 * 7) revert InvalidConfiguration();
        if (maxMintsPerUser == 0 || maxMintsPerUser > 100) revert InvalidConfiguration();
        
        autoMintConfig = AutoMintConfig({
            baseReward: baseReward,
            bonusMultiplier: bonusMultiplier,
            minHoldTime: minHoldTime,
            maxMintsPerUser: maxMintsPerUser
        });
        
        emit ConfigUpdated("AutoMintConfig", 0, 0);
    }
    
    // --- CORRECTED: Added the missing toggleAutoMint function ---
    function toggleAutoMint(bool _autoMintEnabled) external onlyRole(DEFAULT_ADMIN_ROLE) {
        autoMintEnabled = _autoMintEnabled;
        emit AutoMintToggled(_autoMintEnabled);
    }
    // --- END CORRECTION ---

    function toggleEmergencyStop(bool _emergencyStop) external onlyRole(EMERGENCY_ROLE) {
        emergencyStop = _emergencyStop;
        emit EmergencyStopToggled(_emergencyStop);
    }
    
    function emergencyResetUserLimits(address user) external onlyRole(EMERGENCY_ROLE) {
        delete userMintData[user];
        emit AntiAbuseTriggered(user, "Emergency reset");
    }
    
    function emergencyResetGlobalLimits() external onlyRole(EMERGENCY_ROLE) {
        globalDailyMinted = 0;
        currentDay = uint32(block.timestamp / 86400);
    }
    
    function transfer(address to, uint256 amount) public override returns (bool) {
        if (emergencyStop) revert EmergencyStopActive();
        return super.transfer(to, amount);
    }
    
    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        if (emergencyStop) revert EmergencyStopActive();
        return super.transferFrom(from, to, amount);
    }
    
    function batchMint(address[] calldata recipients, uint256[] calldata amounts) external onlyRole(MINTER_BURNER_ROLE) {
        if (recipients.length != amounts.length) revert InvalidAmount();
        if (recipients.length > 100) revert InvalidAmount();
        
        uint256 totalAmount = 0;
        for (uint256 i = 0; i < amounts.length; i++) {
            totalAmount += amounts[i];
        }
        
        if (totalSupply() + totalAmount > MAX_SUPPLY) revert ExceedsMaxSupply();
        
        for (uint256 i = 0; i < recipients.length; i++) {
            _mint(recipients[i], amounts[i]);
        }
    }
    
    function getContractStatus() external view returns (
        bool _emergencyStopStatus,
        bool _autoMintStatus,
        uint256 _totalSupply,
        uint256 _maxSupply,
        uint256 _globalDailyMinted,
        uint256 _globalDailyLimit,
        uint32 _currentDay
    ) {
        return (
            emergencyStop,
            autoMintEnabled,
            totalSupply(),
            MAX_SUPPLY,
            globalDailyMinted,
            GLOBAL_DAILY_LIMIT,
            currentDay
        );
    }
}
