// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

/**
 * @title TGHSXToken
 * @dev ERC-20 token contract for the tGHSX stablecoin.
 * Combines role-based minting with standard ERC20Burnable functionality.
 * Minting is restricted to accounts with MINTER_BURNER_ROLE.
 * Burning can be done through the standard ERC20Burnable burnFrom function or role-based burning.
 * Admin roles are managed via OpenZeppelin's AccessControl.
 */
contract TGHSXToken is ERC20, AccessControl, ERC20Burnable {
    // Define roles for minting and burning tokens
    bytes32 public constant MINTER_BURNER_ROLE = keccak256("MINTER_BURNER_ROLE");
    
    // Emergency controls
    bool public emergencyStop = false;
    
    // Events
    event EmergencyStopToggled(bool status);
    event RoleBurning(address indexed from, uint256 amount, address indexed burner);

    // Custom errors
    error EmergencyStopActive();
    error InvalidAmount();

    /**
     * @dev Constructor to initialize the ERC-20 token with name and symbol.
     * The deployer of the contract is automatically granted the DEFAULT_ADMIN_ROLE.
     * MINTER_BURNER_ROLE can be granted to authorized contracts like CollateralVault.
     */
    constructor() ERC20("tGHSX Stablecoin", "tGHSX") {
        // Grant the deployer the admin role
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    /**
     * @dev Creates new tokens and assigns them to an account.
     * Only accounts with MINTER_BURNER_ROLE are allowed to call this.
     * This function will typically be called by the CollateralVault contract.
     * @param to The address that will receive the minted tokens.
     * @param amount The amount of tokens to mint.
     */
    function mint(address to, uint256 amount) public virtual onlyRole(MINTER_BURNER_ROLE) {
        if (emergencyStop) revert EmergencyStopActive();
        if (amount == 0) revert InvalidAmount();
        _mint(to, amount);
    }

    /**
     * @dev Enhanced burnFrom that supports both role-based burning (for vault operations)
     * and standard allowance-based burning (maintaining ERC20 compatibility).
     * @param from The address from which tokens will be burned.
     * @param amount The amount of tokens to burn.
     */
    function burnFrom(address from, uint256 amount) public override {
        if (emergencyStop) revert EmergencyStopActive();
        if (amount == 0) revert InvalidAmount();
        
        if (hasRole(MINTER_BURNER_ROLE, msg.sender)) {
            // Role-based burning without allowance check (for vault operations)
            _burn(from, amount);
            emit RoleBurning(from, amount, msg.sender);
        } else {
            // Standard ERC20 allowance-based burning
            super.burnFrom(from, amount);
        }
    }

    /**
     * @dev Role-based burn function for vault operations (more explicit)
     * Only accounts with MINTER_BURNER_ROLE can call this.
     * @param from The address from which tokens will be burned.
     * @param amount The amount of tokens to burn.
     */
    function roleBurn(address from, uint256 amount) external onlyRole(MINTER_BURNER_ROLE) {
        if (emergencyStop) revert EmergencyStopActive();
        if (amount == 0) revert InvalidAmount();
        _burn(from, amount);
        emit RoleBurning(from, amount, msg.sender);
    }

    /**
     * @dev Standard burn function (burning own tokens)
     * @param amount The amount of tokens to burn.
     */
    function burn(uint256 amount) public override {
        if (emergencyStop) revert EmergencyStopActive();
        super.burn(amount);
    }

    /**
     * @dev Helper function for admins to revoke roles.
     * Only accounts with DEFAULT_ADMIN_ROLE can revoke any role.
     * @param role The role to revoke.
     * @param account The account from which the role will be revoked.
     */
    function revokeRole(bytes32 role, address account) public override onlyRole(DEFAULT_ADMIN_ROLE) {
        _revokeRole(role, account);
    }

    /**
     * @dev Emergency stop toggle for minting/burning operations
     * Only accounts with DEFAULT_ADMIN_ROLE can toggle this.
     * @param _emergencyStop The new emergency stop status.
     */
    function toggleEmergencyStop(bool _emergencyStop) external onlyRole(DEFAULT_ADMIN_ROLE) {
        emergencyStop = _emergencyStop;
        emit EmergencyStopToggled(_emergencyStop);
    }

    /**
     * @dev See {ERC20-decimals}.
     * This is overridden to explicitly set 18 decimals, which is standard for most ERC-20s.
     */
    function decimals() public view override returns (uint8) {
        return 18; // Standard ERC-20 decimals
    }

    /**
     * @dev Override transfer to respect emergency stop
     */
    function transfer(address to, uint256 amount) public override returns (bool) {
        if (emergencyStop) revert EmergencyStopActive();
        return super.transfer(to, amount);
    }

    /**
     * @dev Override transferFrom to respect emergency stop
     */
    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        if (emergencyStop) revert EmergencyStopActive();
        return super.transferFrom(from, to, amount);
    }
}