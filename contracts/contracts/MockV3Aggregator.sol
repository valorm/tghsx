// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

/**
 * @title MockV3Aggregator
 * @dev A mock Chainlink AggregatorV3Interface for testing purposes.
 * It allows setting the return value for latestRoundData.
 */
contract MockV3Aggregator is AggregatorV3Interface {
    int256 internal latestAnswer;
    uint8 internal decimalsV;
    string internal descriptionV;

    /**
     * @dev Constructor to set the initial price and decimals.
     * @param _initialAnswer The initial price to return.
     * @param _decimals The number of decimals for the price.
     * @param _description Custom description for the price feed. Pass empty string "" for default "Mock Price Feed".
     */
    constructor(int256 _initialAnswer, uint8 _decimals, string memory _description) {
        latestAnswer = _initialAnswer;
        decimalsV = _decimals;
        descriptionV = bytes(_description).length > 0 ? _description : "Mock Price Feed";
    }

    /**
     * @dev Allows updating the mock price.
     * @param _newAnswer The new price to set.
     */
    function updateAnswer(int256 _newAnswer) public {
        latestAnswer = _newAnswer;
    }

    /**
     * @dev Allows updating the description.
     * @param _newDescription The new description to set.
     */
    function updateDescription(string memory _newDescription) public {
        descriptionV = _newDescription;
    }

    /**
     * @dev Mock implementation of latestRoundData from AggregatorV3Interface.
     */
    function latestRoundData()
        external
        view
        override
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        roundId = 1;
        answer = latestAnswer;
        startedAt = block.timestamp;
        updatedAt = block.timestamp;
        answeredInRound = 1;
    }

    /**
     * @dev Mock implementation of description from AggregatorV3Interface.
     */
    function description() external view override returns (string memory) {
        return descriptionV;
    }

    /**
     * @dev Mock implementation of decimals from AggregatorV3Interface.
     */
    function decimals() external view override returns (uint8) {
        return decimalsV;
    }

    /**
     * @dev Mock implementation of version from AggregatorV3Interface.
     */
    function version() external view override returns (uint256) {
        return 1;
    }

    /**
     * @dev Mock implementation of getRoundData from AggregatorV3Interface.
     */
    function getRoundData(uint80 /*_roundId*/) // Commented out _roundId
        external 
        view 
        override 
        returns (
            uint80 roundId, 
            int256 answer, 
            uint256 startedAt, 
            uint256 updatedAt, 
            uint80 answeredInRound
        ) 
    {
        return (1, latestAnswer, block.timestamp, block.timestamp, 1);
    }
}