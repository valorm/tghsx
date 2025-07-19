// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title VersionRegistry
 * @author tGHSX Protocol
 * @notice A simple, on-chain registry to track the latest versions of protocol contracts.
 * @dev This contract provides a central, updatable reference point for contract addresses,
 * useful for frontend integrations and upgrade processes.
 */
contract VersionRegistry is AccessControl {
    /**
     * @dev Role that can update contract versions.
     */
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    struct Version {
        uint256 version;
        address contractAddress;
        uint256 deploymentDate;
        string notes;
    }

    // Mapping from a component name (e.g., "CollateralVault") to its version history
    mapping(string => Version[]) private versionHistory;
    // Mapping from a component name to the count of its versions
    mapping(string => uint256) private versionCount;

    event VersionUpdated(
        string indexed component,
        uint256 indexed version,
        address indexed contractAddress,
        string notes
    );

    /**
     * @dev Sets up the deployer with both default admin and upgrader roles.
     */
    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(UPGRADER_ROLE, msg.sender);
    }

    /**
     * @notice Sets or updates the address for a protocol component.
     * @param component The name of the component (e.g., "CollateralVault").
     * @param contractAddress The new address of the contract.
     * @param notes A brief description of the update or version.
     */
    function setVersion(
        string memory component,
        address contractAddress,
        string memory notes
    ) external onlyRole(UPGRADER_ROLE) {
        require(contractAddress != address(0), "VersionRegistry: Zero address");
        
        uint256 newVersionNumber = versionCount[component] + 1;

        Version memory newVersion = Version({
            version: newVersionNumber,
            contractAddress: contractAddress,
            deploymentDate: block.timestamp,
            notes: notes
        });

        versionHistory[component].push(newVersion);
        versionCount[component] = newVersionNumber;

        emit VersionUpdated(component, newVersionNumber, contractAddress, notes);
    }

    /**
     * @notice Gets the latest version details for a specific component.
     * @param component The name of the component.
     * @return The latest version details.
     */
    function getLatestVersion(string memory component)
        public
        view
        returns (Version memory)
    {
        uint256 count = versionCount[component];
        require(count > 0, "VersionRegistry: Component not found");
        return versionHistory[component][count - 1];
    }

    /**
     * @notice Gets the address of the latest version of a component.
     * @param component The name of the component.
     * @return The contract address.
     */
    function getLatestAddress(string memory component)
        public
        view
        returns (address)
    {
        return getLatestVersion(component).contractAddress;
    }

    /**
     * @notice Gets the full version history for a component.
     * @param component The name of the component.
     * @return An array of all version details for the component.
     */
    function getHistory(string memory component)
        public
        view
        returns (Version[] memory)
    {
        return versionHistory[component];
    }
}
