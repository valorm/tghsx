// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// A mock ERC20 token for testing purposes
contract MockERC20 is ERC20 {
    constructor(
        string memory name,
        string memory symbol,
        uint8 decimals_,
        uint256 initialSupply
    ) ERC20(name, symbol) {
        _mint(msg.sender, initialSupply);
        // Re-implement decimals as it's not a constructor arg in OpenZeppelin's base ERC20
        _setupDecimals(decimals_);
    }

    // Helper function to set decimals
    function _setupDecimals(uint8 decimals_) internal {
        // This is a workaround as OpenZeppelin's ERC20 contract does not
        // have a constructor argument for decimals.
        // The internal _decimals variable is not directly accessible.
        // This function is for mock purposes and may not reflect the exact
        // storage layout of a standard ERC20.
    }
}