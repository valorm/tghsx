// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./MockV3Aggregator.sol";

contract MockV3AggregatorFactory {
    mapping(string => address) public aggregators;
    string[] public aggregatorNames;
    
    event AggregatorCreated(string indexed name, address indexed aggregator, uint8 decimals, int256 initialAnswer);
    event AggregatorUpdated(string indexed name, address indexed aggregator, int256 newAnswer);
    
    /**
     * @dev Create a new mock aggregator
     */
    function createMockAggregator(
        string memory name,
        uint8 decimals,
        int256 initialAnswer
    ) external returns (address) {
        require(aggregators[name] == address(0), "Aggregator already exists");
        
        MockV3Aggregator aggregator = new MockV3Aggregator(decimals, initialAnswer);
        aggregators[name] = address(aggregator);
        aggregatorNames.push(name);
        
        emit AggregatorCreated(name, address(aggregator), decimals, initialAnswer);
        return address(aggregator);
    }
    
    /**
     * @dev Get aggregator address by name
     */
    function getAggregator(string memory name) external view returns (address) {
        return aggregators[name];
    }
    
    /**
     * @dev Check if aggregator exists
     */
    function hasAggregator(string memory name) external view returns (bool) {
        return aggregators[name] != address(0);
    }
    
    /**
     * @dev Get all aggregator names
     */
    function getAllAggregatorNames() external view returns (string[] memory) {
        return aggregatorNames;
    }
    
    /**
     * @dev Get number of aggregators
     */
    function getAggregatorCount() external view returns (uint256) {
        return aggregatorNames.length;
    }
    
    /**
     * @dev Update answer for a specific aggregator (DEFAULT symbol)
     */
    function updateAnswer(string memory name, int256 newAnswer) external {
        address aggregatorAddress = aggregators[name];
        require(aggregatorAddress != address(0), "Aggregator not found");
        
        MockV3Aggregator(aggregatorAddress).updateAnswer(newAnswer);
        
        emit AggregatorUpdated(name, aggregatorAddress, newAnswer);
    }
    
    /**
     * @dev Update answer for a specific symbol within an aggregator
     */
    function updateAnswerForSymbol(
        string memory name, 
        string memory symbol, 
        int256 newAnswer
    ) external {
        address aggregatorAddress = aggregators[name];
        require(aggregatorAddress != address(0), "Aggregator not found");
        
        MockV3Aggregator(aggregatorAddress).updateAnswer(symbol, newAnswer);
        
        emit AggregatorUpdated(name, aggregatorAddress, newAnswer);
    }
    
    /**
     * @dev Get latest price from aggregator
     */
    function getLatestPrice(string memory name) external view returns (int256) {
        address aggregatorAddress = aggregators[name];
        require(aggregatorAddress != address(0), "Aggregator not found");
        
        (, int256 price, , , ) = MockV3Aggregator(aggregatorAddress).latestRoundData();
        return price;
    }
    
    /**
     * @dev Get latest price for a specific symbol
     */
    function getLatestPriceForSymbol(string memory name, string memory symbol) external view returns (int256) {
        address aggregatorAddress = aggregators[name];
        require(aggregatorAddress != address(0), "Aggregator not found");
        
        return MockV3Aggregator(aggregatorAddress).getLatestAnswer(symbol);
    }
    
    /**
     * @dev Get latest round data from aggregator
     */
    function getLatestRoundData(string memory name) 
        external 
        view 
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        ) 
    {
        address aggregatorAddress = aggregators[name];
        require(aggregatorAddress != address(0), "Aggregator not found");
        
        return MockV3Aggregator(aggregatorAddress).latestRoundData();
    }
    
    /**
     * @dev Get round data for a specific symbol
     */
    function getRoundDataForSymbol(string memory name, string memory symbol) 
        external 
        view 
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        ) 
    {
        address aggregatorAddress = aggregators[name];
        require(aggregatorAddress != address(0), "Aggregator not found");
        
        return MockV3Aggregator(aggregatorAddress).getLatestRoundData(symbol);
    }
    
    /**
     * @dev Get decimals from aggregator
     */
    function getDecimals(string memory name) external view returns (uint8) {
        address aggregatorAddress = aggregators[name];
        require(aggregatorAddress != address(0), "Aggregator not found");
        
        return MockV3Aggregator(aggregatorAddress).decimals();
    }
    
    /**
     * @dev Get description from aggregator
     */
    function getDescription(string memory name) external view returns (string memory) {
        address aggregatorAddress = aggregators[name];
        require(aggregatorAddress != address(0), "Aggregator not found");
        
        return MockV3Aggregator(aggregatorAddress).description();
    }
    
    /**
     * @dev Batch update multiple aggregators
     */
    function batchUpdateAnswers(
        string[] memory names,
        int256[] memory newAnswers
    ) external {
        require(names.length == newAnswers.length, "Array length mismatch");
        require(names.length <= 20, "Too many updates");
        
        for (uint256 i = 0; i < names.length; i++) {
            address aggregatorAddress = aggregators[names[i]];
            if (aggregatorAddress != address(0)) {
                MockV3Aggregator(aggregatorAddress).updateAnswer(newAnswers[i]);
                emit AggregatorUpdated(names[i], aggregatorAddress, newAnswers[i]);
            }
        }
    }
    
    /**
     * @dev Get multiple latest prices
     */
    function getMultipleLatestPrices(string[] memory names)
        external
        view
        returns (int256[] memory prices)
    {
        prices = new int256[](names.length);
        for (uint256 i = 0; i < names.length; i++) {
            address aggregatorAddress = aggregators[names[i]];
            if (aggregatorAddress != address(0)) {
                (, int256 price, , , ) = MockV3Aggregator(aggregatorAddress).latestRoundData();
                prices[i] = price;
            } else {
                prices[i] = 0; // Return 0 for non-existent aggregators
            }
        }
    }
    
    /**
     * @dev Simulate price movement for an aggregator
     */
    function simulatePriceMovement(
        string memory name,
        string memory symbol,
        int256 percentageChange
    ) external {
        address aggregatorAddress = aggregators[name];
        require(aggregatorAddress != address(0), "Aggregator not found");
        
        MockV3Aggregator(aggregatorAddress).simulatePriceMovement(symbol, percentageChange);
    }
    
    /**
     * @dev Add a new symbol to an existing aggregator
     */
    function addSymbolToAggregator(
        string memory name,
        string memory symbol,
        uint8 decimals,
        int256 initialAnswer
    ) external {
        address aggregatorAddress = aggregators[name];
        require(aggregatorAddress != address(0), "Aggregator not found");
        
        MockV3Aggregator(aggregatorAddress).addMockAggregator(symbol, decimals, initialAnswer);
    }
    
    /**
     * @dev Remove an aggregator (for testing purposes)
     */
    function removeAggregator(string memory name) external {
        require(aggregators[name] != address(0), "Aggregator not found");
        
        delete aggregators[name];
        
        // Remove from names array
        for (uint256 i = 0; i < aggregatorNames.length; i++) {
            if (keccak256(bytes(aggregatorNames[i])) == keccak256(bytes(name))) {
                aggregatorNames[i] = aggregatorNames[aggregatorNames.length - 1];
                aggregatorNames.pop();
                break;
            }
        }
    }
}