// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import "./TGHSXToken.sol";

/**
 * @title OptimizedCollateralVault
 * @dev Enhanced vault contract for ETH collateral and tGHSX token management
 * Key improvements: Better error handling, emergency functions, interest rates, and security
 */
contract CollateralVault is Ownable, ReentrancyGuard, Pausable {
    // --- Packed Constants for Better Gas Efficiency ---
    uint256 public constant PRICE_PRECISION = 1e8;
    uint256 public constant RATIO_PRECISION = 10000;
    uint256 public constant LIQUIDATION_BONUS = 500; // 5%
    uint256 public constant MAX_LIQUIDATION_PERCENT = 5000; // 50%
    uint256 public constant PRICE_STALENESS_THRESHOLD = 3600; // 1 hour
    uint256 public constant MIN_DEBT_AMOUNT = 1e18; // 1 tGHSX minimum debt
    uint256 public constant MIN_COLLATERAL_AMOUNT = 1e15; // 0.001 ETH minimum
    
    // --- Immutable Variables (Set Once in Constructor) ---
    TGHSXToken public immutable tghsxToken;
    AggregatorV3Interface public immutable ethUsdPriceFeed;
    AggregatorV3Interface public immutable usdGhsPriceFeed;
    
    // --- Enhanced User Position Struct ---
    struct UserPosition {
        uint128 ethCollateral; // ETH collateral in wei
        uint128 tghsxMinted;   // tGHSX debt in wei
    }
    
    // --- Enhanced Vault Configuration ---
    struct VaultConfig {
        uint64 minCollateralRatio; // 150% = 15000
        uint64 liquidationRatio;   // 140% = 14000  
        uint64 maxCollateralRatio; // 500% = 50000
        uint64 lastConfigUpdate;   // Timestamp of last update
    }
    
    // --- State Variables ---
    mapping(address => UserPosition) public userPositions;
    VaultConfig public vaultConfig;
    
    // --- Enhanced Price Caching ---
    struct PriceCache {
        uint128 ethGhsPrice;
        uint64 lastUpdate;
        uint64 cacheValidDuration;
    }
    PriceCache private priceCache;
    
    // --- Treasury and Fees ---
    address public treasury;
    uint256 public stabilityFeeRate = 0; // Annual fee in basis points (0 = no fee)
    mapping(address => uint256) public lastFeeUpdate;
    
    // --- Emergency Controls ---
    mapping(address => bool) public emergencyAuthorized;
    uint256 public maxSingleDeposit = 1000 ether; // Max single deposit
    uint256 public totalValueLocked; // Track total ETH locked
    
    // --- Events (Enhanced) ---
    event CollateralDeposited(address indexed user, uint256 amount, uint256 indexed blockNumber);
    event CollateralWithdrawn(address indexed user, uint256 amount);
    event TGHSXMinted(address indexed user, uint256 amount, uint256 indexed newRatio);
    event TGHSXBurned(address indexed user, uint256 amount, uint256 indexed newRatio);
    event VaultLiquidated(
        address indexed user,
        address indexed liquidator,
        uint256 repaidTGHSX,
        uint256 liquidatedETH,
        uint256 bonus
    );
    event BatchOperation(address indexed user, uint8 indexed operationType, uint256 count);
    event EmergencyAction(address indexed executor, string action, address indexed target);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event StabilityFeeUpdated(uint256 oldRate, uint256 newRate);
    event ConfigUpdated(uint256 minRatio, uint256 liquidationRatio, uint256 maxRatio);
    event PriceCacheUpdated(uint256 newPrice, uint256 timestamp);
    
    // --- Enhanced Custom Errors ---
    error InvalidAmount();
    error InsufficientCollateral();
    error InsufficientDebt();
    error VaultUndercollateralized();
    error VaultNotLiquidatable();
    error InvalidAddress();
    error TransferFailed();
    error PriceStale();
    error InvalidPrice();
    error ExceedsMaxDeposit();
    error BelowMinimumAmount();
    error UnauthorizedEmergencyAction();
    error InvalidConfiguration();
    error FeeCalculationError();
    
    // --- Enhanced Modifiers ---
    modifier validAmount(uint256 amount) {
        if (amount == 0) revert InvalidAmount();
        _;
    }
    
    modifier validAddress(address addr) {
        if (addr == address(0)) revert InvalidAddress();
        _;
    }
    
    modifier onlyEmergencyAuthorized() {
        if (!emergencyAuthorized[msg.sender] && msg.sender != owner()) {
            revert UnauthorizedEmergencyAction();
        }
        _;
    }
    
    modifier checkDepositLimits(uint256 amount) {
        if (amount > maxSingleDeposit) revert ExceedsMaxDeposit();
        if (amount < MIN_COLLATERAL_AMOUNT) revert BelowMinimumAmount();
        _;
    }
    
    // --- Constructor ---
    constructor(
        address _tghsxTokenAddress,
        address _ethUsdPriceFeed,
        address _usdGhsPriceFeed,
        address _treasury
    ) 
        Ownable(msg.sender)
        validAddress(_tghsxTokenAddress)
        validAddress(_ethUsdPriceFeed)
        validAddress(_usdGhsPriceFeed)
        validAddress(_treasury)
    {
        tghsxToken = TGHSXToken(_tghsxTokenAddress);
        ethUsdPriceFeed = AggregatorV3Interface(_ethUsdPriceFeed);
        usdGhsPriceFeed = AggregatorV3Interface(_usdGhsPriceFeed);
        treasury = _treasury;
        
        vaultConfig = VaultConfig({
            minCollateralRatio: 15000,
            liquidationRatio: 14000,
            maxCollateralRatio: 50000,
            lastConfigUpdate: uint64(block.timestamp)
        });
        
        priceCache.cacheValidDuration = 300;
        
        emergencyAuthorized[msg.sender] = true;
    }
    
    // --- Enhanced Core Functions ---
    
    function deposit() external payable nonReentrant whenNotPaused validAmount(msg.value) checkDepositLimits(msg.value) {
        UserPosition storage position = userPositions[msg.sender];
        uint256 newCollateral = uint256(position.ethCollateral) + msg.value;
        if (newCollateral > type(uint128).max) revert InsufficientCollateral();
        
        position.ethCollateral = uint128(newCollateral);
        totalValueLocked += msg.value;
        
        emit CollateralDeposited(msg.sender, msg.value, block.number);
    }
    
    function withdraw(uint256 amount) external nonReentrant whenNotPaused validAmount(amount) {
        UserPosition storage position = userPositions[msg.sender];
        if (position.ethCollateral < amount) revert InsufficientCollateral();
        
        if (position.tghsxMinted > 0) {
            _updateStabilityFees(msg.sender);
        }
        
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
    
    function mintTGHSX(uint256 amount) external nonReentrant whenNotPaused validAmount(amount) {
        if (amount < MIN_DEBT_AMOUNT) revert BelowMinimumAmount();
        UserPosition storage position = userPositions[msg.sender];
        
        if (position.ethCollateral == 0) revert InsufficientCollateral();

        if (position.tghsxMinted > 0) {
            _updateStabilityFees(msg.sender);
        }
        
        uint256 newDebt = uint256(position.tghsxMinted) + amount;
        if (newDebt > type(uint128).max) revert InsufficientDebt();
        
        uint256 ratio = _calculateCollateralizationRatio(position.ethCollateral, uint128(newDebt));
        
        if (ratio < vaultConfig.minCollateralRatio) revert VaultUndercollateralized();
        if (ratio > vaultConfig.maxCollateralRatio) revert VaultUndercollateralized();
        
        position.tghsxMinted = uint128(newDebt);
        lastFeeUpdate[msg.sender] = block.timestamp;
        
        tghsxToken.mint(msg.sender, amount);
        
        emit TGHSXMinted(msg.sender, amount, ratio);
    }
    
    function burnTGHSX(uint256 amount) external nonReentrant whenNotPaused validAmount(amount) {
        UserPosition storage position = userPositions[msg.sender];
        if (position.tghsxMinted < amount) revert InsufficientDebt();
        
        _updateStabilityFees(msg.sender);
        
        uint128 newDebt = position.tghsxMinted - uint128(amount);
        position.tghsxMinted = newDebt;
        
        if (newDebt == 0) {
            lastFeeUpdate[msg.sender] = 0;
        }
        
        tghsxToken.burnFrom(msg.sender, amount);
        
        uint256 ratio = newDebt > 0 ? 
            _calculateCollateralizationRatio(position.ethCollateral, newDebt) : 
            type(uint256).max;
            
        emit TGHSXBurned(msg.sender, amount, ratio);
    }
    
    function depositAndMint(uint256 tghsxAmountToMint) 
        external 
        payable 
        nonReentrant 
        whenNotPaused 
        validAmount(msg.value)
        validAmount(tghsxAmountToMint)
    {
        require(msg.value >= 0.001 ether, "Minimum collateral is 0.001 ETH");
        if (tghsxAmountToMint < MIN_DEBT_AMOUNT) revert BelowMinimumAmount();
        
        UserPosition storage position = userPositions[msg.sender];

        if (position.tghsxMinted > 0) {
            _updateStabilityFees(msg.sender);
        }
        
        uint256 newCollateral = uint256(position.ethCollateral) + msg.value;
        uint256 newDebt = uint256(position.tghsxMinted) + tghsxAmountToMint;
        
        if (newCollateral > type(uint128).max || newDebt > type(uint128).max) {
            revert InsufficientCollateral();
        }
        
        uint256 ratio = _calculateCollateralizationRatio(uint128(newCollateral), uint128(newDebt));
        
        if (ratio < vaultConfig.minCollateralRatio || ratio > vaultConfig.maxCollateralRatio) {
            revert VaultUndercollateralized();
        }
        
        position.ethCollateral = uint128(newCollateral);
        position.tghsxMinted = uint128(newDebt);
        totalValueLocked += msg.value;
        lastFeeUpdate[msg.sender] = block.timestamp;
        
        tghsxToken.mint(msg.sender, tghsxAmountToMint);
        
        emit CollateralDeposited(msg.sender, msg.value, block.number);
        emit TGHSXMinted(msg.sender, tghsxAmountToMint, ratio);
    }

    function repayAndWithdraw(uint256 repayAmount, uint256 withdrawAmount) external nonReentrant whenNotPaused {
        UserPosition storage position = userPositions[msg.sender];

        if (repayAmount > 0) {
            if (position.tghsxMinted < repayAmount) revert InsufficientDebt();
            
            _updateStabilityFees(msg.sender);
            
            uint128 newDebt = position.tghsxMinted - uint128(repayAmount);
            position.tghsxMinted = newDebt;

            if (newDebt == 0) {
                lastFeeUpdate[msg.sender] = 0;
            }
            
            tghsxToken.burnFrom(msg.sender, repayAmount);
            emit TGHSXBurned(msg.sender, repayAmount, _calculateCollateralizationRatio(position.ethCollateral, newDebt));
        }

        if (withdrawAmount > 0) {
            if (position.ethCollateral < withdrawAmount) revert InsufficientCollateral();
            
            if (repayAmount == 0 && position.tghsxMinted > 0) {
                _updateStabilityFees(msg.sender);
            }
            
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
    
    // --- Enhanced Price Functions ---
    
    function getEthGhsPrice() public view returns (uint256) {
        if (block.timestamp - priceCache.lastUpdate < priceCache.cacheValidDuration && 
            priceCache.ethGhsPrice > 0) {
            return priceCache.ethGhsPrice;
        }
        
        (int256 ethUsd, uint256 ethTimestamp) = _getEthUsdPrice();
        (int256 usdGhs, uint256 ghsTimestamp) = _getUsdGhsPrice();
        
        if (ethUsd <= 0 || usdGhs <= 0) revert InvalidPrice();
        
        uint256 currentTime = block.timestamp;
        if (currentTime - ethTimestamp > PRICE_STALENESS_THRESHOLD ||
            currentTime - ghsTimestamp > PRICE_STALENESS_THRESHOLD) {
            revert PriceStale();
        }
        
        uint256 calculatedPrice = uint256((ethUsd * usdGhs) / int256(PRICE_PRECISION));
        if (calculatedPrice == 0) revert InvalidPrice();
        
        return calculatedPrice;
    }
    
    function updatePriceCache() external {
        uint256 newPrice = getEthGhsPrice();

        if (priceCache.ethGhsPrice > 0) {
            uint256 oldPrice = priceCache.ethGhsPrice;
            uint256 priceDiff = newPrice > oldPrice ? newPrice - oldPrice : oldPrice - newPrice;
            uint256 maxChange = (oldPrice * 5000) / RATIO_PRECISION;
            
            if (priceDiff > maxChange && block.timestamp - priceCache.lastUpdate < priceCache.cacheValidDuration * 2) {
                if (msg.sender != owner() && !emergencyAuthorized[msg.sender]) {
                    revert InvalidPrice();
                }
            }
        }
        
        priceCache.ethGhsPrice = uint128(newPrice);
        priceCache.lastUpdate = uint64(block.timestamp);
        
        emit PriceCacheUpdated(newPrice, block.timestamp);
    }
    
    // --- Stability Fee Functions ---
    
    function _updateStabilityFees(address user) internal {
        if (stabilityFeeRate == 0 || lastFeeUpdate[user] == 0) return;
        
        UserPosition storage position = userPositions[user];
        if (position.tghsxMinted == 0) return;
        
        uint256 timeElapsed = block.timestamp - lastFeeUpdate[user];
        if (timeElapsed == 0) return;
        
        uint256 feeAmount = (uint256(position.tghsxMinted) * stabilityFeeRate * timeElapsed) / 
                           (365 days * RATIO_PRECISION);
                           
        if (feeAmount > 0) {
            uint256 newDebt = uint256(position.tghsxMinted) + feeAmount;
            if (newDebt <= type(uint128).max) {
                position.tghsxMinted = uint128(newDebt);
                tghsxToken.mint(treasury, feeAmount);
            }
        }
        
        lastFeeUpdate[user] = block.timestamp;
    }
    
    function updateUserFees(address user) external {
        _updateStabilityFees(user);
    }
    
    // --- Enhanced Internal Helper Functions ---
    
    function _getEthUsdPrice() internal view returns (int256 price, uint256 timestamp) {
        (, price, , timestamp, ) = ethUsdPriceFeed.latestRoundData();
        if (timestamp == 0 || price <= 0) revert InvalidPrice();
    }
    
    function _getUsdGhsPrice() internal view returns (int256 price, uint256 timestamp) {
        (, price, , timestamp, ) = usdGhsPriceFeed.latestRoundData();
        if (timestamp == 0 || price <= 0) revert InvalidPrice();
    }
    
    function _calculateCollateralizationRatio(uint128 ethCollateral, uint128 tghsxMinted) 
        internal 
        view 
        returns (uint256) 
    {
        if (tghsxMinted == 0) return type(uint256).max;
        
        uint256 ethGhsPrice = getEthGhsPrice();
        uint256 collateralValueGHS = (uint256(ethCollateral) * ethGhsPrice) / PRICE_PRECISION;
        
        return (collateralValueGHS * RATIO_PRECISION) / uint256(tghsxMinted);
    }
    
    function _transferETH(address to, uint256 amount) internal {
        (bool success, ) = payable(to).call{value: amount}("");
        if (!success) revert TransferFailed();
    }
    
    /**
     * @notice External function to liquidate an undercollateralized vault.
     * @param user The address of the vault owner to liquidate.
     * @param tghsxToRepay The amount of debt the liquidator will repay.
     */
    function liquidateVault(address user, uint256 tghsxToRepay) external {
        // Calls the internal logic
        _liquidateVault(user, tghsxToRepay);
    }

    function _liquidateVault(address user, uint256 tghsxToRepay) internal {
        if (user == msg.sender) revert InvalidAddress();
        
        UserPosition storage position = userPositions[user];
        if (position.tghsxMinted == 0) revert InsufficientDebt();
        
        _updateStabilityFees(user);
        
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
        
        if (position.tghsxMinted == 0) {
            lastFeeUpdate[user] = 0;
        }
        
        tghsxToken.burnFrom(msg.sender, tghsxToRepay);
        _transferETH(msg.sender, totalETH);
        
        emit VaultLiquidated(user, msg.sender, tghsxToRepay, liquidatedETH, bonus);
    }
    
    // --- Enhanced Admin Functions ---
    
    /**
     * @notice (Owner Only) Mints tokens for a user and updates their debt.
     * @dev Called by the backend after an admin approves a mint request.
     * @param user The address of the user to receive the tokens.
     * @param amount The amount of tGHSX to mint.
     */
    function adminMintForUser(address user, uint256 amount) external onlyOwner validAddress(user) validAmount(amount) {
        UserPosition storage position = userPositions[user];

        // Update stability fees if user already has debt
        if (position.tghsxMinted > 0) {
            _updateStabilityFees(user);
        }

        // Calculate new debt and check overflow
        uint256 newDebt = uint256(position.tghsxMinted) + amount;
        if (newDebt > type(uint128).max) revert InsufficientDebt();
        
        // Update the user's debt record
        position.tghsxMinted = uint128(newDebt);

        // Mint the tokens to the user
        tghsxToken.mint(user, amount);

        // Update the last fee calculation timestamp for the user
        lastFeeUpdate[user] = block.timestamp;

        // Calculate collateralization ratio for event
        uint256 ratio = _calculateCollateralizationRatio(position.ethCollateral, position.tghsxMinted);
        
        // Emit event for tracking
        emit TGHSXMinted(user, amount, ratio);
    }
    
    function updateVaultConfig(
        uint64 newMinRatio,
        uint64 newLiquidationRatio,
        uint64 newMaxRatio
    ) external onlyOwner {
        if (newLiquidationRatio == 0 || newMinRatio <= newLiquidationRatio || 
            newMinRatio > newMaxRatio || newLiquidationRatio < 10000) 
        {
            revert InvalidConfiguration();
        }
        
        vaultConfig.minCollateralRatio = newMinRatio;
        vaultConfig.liquidationRatio = newLiquidationRatio;
        vaultConfig.maxCollateralRatio = newMaxRatio;
        vaultConfig.lastConfigUpdate = uint64(block.timestamp);
        
        emit ConfigUpdated(newMinRatio, newLiquidationRatio, newMaxRatio);
    }
    
    function updatePriceCacheDuration(uint64 newDuration) external onlyOwner {
        if (newDuration < 60 || newDuration > 3600) revert InvalidConfiguration();
        priceCache.cacheValidDuration = newDuration;
    }
    
    function updateTreasury(address newTreasury) external onlyOwner validAddress(newTreasury) {
        address oldTreasury = treasury;
        treasury = newTreasury;
        emit TreasuryUpdated(oldTreasury, newTreasury);
    }
    
    function updateStabilityFeeRate(uint256 newRate) external onlyOwner {
        if (newRate > 1000) revert InvalidConfiguration();
        uint256 oldRate = stabilityFeeRate;
        stabilityFeeRate = newRate;
        emit StabilityFeeUpdated(oldRate, newRate);
    }
    
    function updateMaxSingleDeposit(uint256 newMax) external onlyOwner {
        if (newMax < 1 ether) revert InvalidConfiguration();
        maxSingleDeposit = newMax;
    }
    
    function setEmergencyAuthorization(address user, bool authorized) external onlyOwner validAddress(user) {
        emergencyAuthorized[user] = authorized;
    }
    
    // --- Emergency Functions ---
    
    function emergencyPause() external onlyEmergencyAuthorized {
        _pause();
        emit EmergencyAction(msg.sender, "PAUSE", address(this));
    }
    
    function emergencyUnpause() external onlyOwner {
        _unpause();
        emit EmergencyAction(msg.sender, "UNPAUSE", address(this));
    }
    
    function emergencyWithdraw() external onlyOwner {
        uint256 balance = address(this).balance;
        if (balance > 0) {
            _transferETH(owner(), balance);
            emit EmergencyAction(msg.sender, "EMERGENCY_WITHDRAW", address(this));
        }
    }
    
    // --- Enhanced Batch Functions ---
    
    function batchLiquidate(
        address[] calldata users,
        uint256[] calldata amounts
    ) external nonReentrant whenNotPaused {
        uint256 length = users.length;
        if (length != amounts.length || length == 0 || length > 50) revert InvalidAmount();
        
        for (uint256 i; i < length;) {
            _liquidateVault(users[i], amounts[i]);
            unchecked { ++i; }
        }
        
        emit BatchOperation(msg.sender, 1, length);
    }
    
    function batchUpdateFees(address[] calldata users) external {
        uint256 length = users.length;
        if (length == 0 || length > 100) revert InvalidAmount();
        
        for (uint256 i; i < length;) {
            _updateStabilityFees(users[i]);
            unchecked { ++i; }
        }
        
        emit BatchOperation(msg.sender, 2, length);
    }
    
    // --- Enhanced View Functions ---
    
    function getUserPosition(address user) 
        external 
        view 
        returns (
            uint256 ethCollateral,
            uint256 tghsxMinted,
            uint256 collateralizationRatio,
            bool isLiquidatable,
            uint256 accruedFees
        ) 
    {
        UserPosition memory position = userPositions[user];
        ethCollateral = position.ethCollateral;
        tghsxMinted = position.tghsxMinted;
        
        accruedFees = _calculateAccruedFees(user);
        
        uint256 totalDebt = tghsxMinted + accruedFees;
        
        if (totalDebt > 0) {
            collateralizationRatio = _calculateCollateralizationRatio(
                position.ethCollateral, 
                uint128(totalDebt)
            );
            isLiquidatable = collateralizationRatio < vaultConfig.liquidationRatio;
        } else {
            collateralizationRatio = type(uint256).max;
            isLiquidatable = false;
        }
    }

    function getUserCollateral(address user) external view returns (uint256) {
        return userPositions[user].ethCollateral;
    }

    function getUserDebt(address user) external view returns (uint256) {
        return userPositions[user].tghsxMinted;
    }

    function getCollateralizationRatio(address user) external view returns (uint256) {
        UserPosition memory position = userPositions[user];
        return _calculateCollateralizationRatio(position.ethCollateral, position.tghsxMinted);
    }
    
    function _calculateAccruedFees(address user) internal view returns (uint256) {
        if (stabilityFeeRate == 0 || lastFeeUpdate[user] == 0) return 0;
        
        UserPosition memory position = userPositions[user];
        if (position.tghsxMinted == 0) return 0;
        
        uint256 timeElapsed = block.timestamp - lastFeeUpdate[user];
        if (timeElapsed == 0) return 0;
        
        return (uint256(position.tghsxMinted) * stabilityFeeRate * timeElapsed) / 
               (365 days * RATIO_PRECISION);
    }
    
    function getVaultHealthMetrics() external view returns (
        uint256 totalCollateral,
        uint256 totalDebt,
        uint256 globalCollateralizationRatio,
        uint256 averageCollateralizationRatio,
        uint256 vaultsAtRisk
    ) {
        totalCollateral = totalValueLocked;
    }
    
    // --- Receive Function (Enhanced) ---
    receive() external payable whenNotPaused {
        if (msg.value > 0 && msg.value >= MIN_COLLATERAL_AMOUNT && msg.value <= maxSingleDeposit) {
            UserPosition storage position = userPositions[msg.sender];
            uint256 newCollateral = uint256(position.ethCollateral) + msg.value;
            
            if (newCollateral <= type(uint128).max) {
                position.ethCollateral = uint128(newCollateral);
                totalValueLocked += msg.value;
                emit CollateralDeposited(msg.sender, msg.value, block.number);
            }
        }
    }
}