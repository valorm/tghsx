// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title MockV3Aggregator
 * @notice A mock implementation of Chainlink's AggregatorV3Interface for testing
 */
contract MockV3Aggregator {
    struct MockAggregatorData {
        uint8 decimals;
        int256 latestAnswer;
        uint256 updatedAt;
        string description;
        uint80 roundId;
    }

    mapping(string => MockAggregatorData) public aggregatorData;
    mapping(string => bool) public aggregatorExists;
    
    // Add these for compatibility with standard Chainlink interface
    uint8 public decimals;
    string public description;
    uint256 public version = 1;
    
    event AnswerUpdated(string indexed symbol, int256 indexed current, uint256 indexed roundId, uint256 updatedAt);
    event NewRound(string indexed symbol, uint256 indexed roundId, address indexed startedBy, uint256 startedAt);

    // Single constructor that handles both cases
    constructor(uint8 _decimals, int256 _initialAnswer) {
        decimals = _decimals;
        description = "Mock Aggregator";
        
        // Initialize mock aggregators with default values
        _createMockAggregator("USDC", 8, 100000000); // $1.00
        _createMockAggregator("WETH", 8, 200000000000); // $2000.00
        _createMockAggregator("WBTC", 8, 4000000000000); // $40000.00
        _createMockAggregator("WMATIC", 8, 80000000); // $0.80
        _createMockAggregator("USDT", 8, 100000000); // $1.00
        _createMockAggregator("DAI", 8, 100000000); // $1.00
        
        // Also create a default aggregator with the provided parameters
        _createMockAggregator("DEFAULT", _decimals, _initialAnswer);
    }

    /**
     * @dev Create a new mock aggregator (internal function)
     */
    function _createMockAggregator(
        string memory symbol,
        uint8 _decimals,
        int256 initialAnswer
    ) internal {
        aggregatorData[symbol] = MockAggregatorData({
            decimals: _decimals,
            latestAnswer: initialAnswer,
            updatedAt: block.timestamp,
            description: symbol,
            roundId: 1
        });
        aggregatorExists[symbol] = true;
    }

    /**
     * @dev Add a new mock aggregator (external function)
     */
    function addMockAggregator(
        string memory symbol,
        uint8 _decimals,
        int256 initialAnswer
    ) external {
        require(!aggregatorExists[symbol], "Aggregator already exists");
        _createMockAggregator(symbol, _decimals, initialAnswer);
    }

    /**
     * @dev Get the latest round data for a symbol
     */
    function getLatestRoundData(string memory symbol)
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
        require(aggregatorExists[symbol], "Aggregator not found");
        MockAggregatorData memory data = aggregatorData[symbol];
        
        return (
            data.roundId,
            data.latestAnswer,
            data.updatedAt,
            data.updatedAt,
            data.roundId
        );
    }

    /**
     * @dev Standard Chainlink interface - get latest round data
     */
    function latestRoundData()
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
        // Return data for DEFAULT aggregator or first available
        if (aggregatorExists["DEFAULT"]) {
            return this.getLatestRoundData("DEFAULT");
        }
        
        // Fallback to USDC if DEFAULT doesn't exist
        if (aggregatorExists["USDC"]) {
            return this.getLatestRoundData("USDC");
        }
        
        // If no aggregators exist, return default values
        return (1, 100000000, block.timestamp, block.timestamp, 1);
    }

    /**
     * @dev Get the number of decimals for a symbol
     */
    function getDecimals(string memory symbol) external view returns (uint8) {
        require(aggregatorExists[symbol], "Aggregator not found");
        return aggregatorData[symbol].decimals;
    }

    /**
     * @dev Get the description for a symbol
     */
    function getDescription(string memory symbol) external view returns (string memory) {
        require(aggregatorExists[symbol], "Aggregator not found");
        return aggregatorData[symbol].description;
    }

    /**
     * @dev Get the latest answer for a symbol
     */
    function getLatestAnswer(string memory symbol) external view returns (int256) {
        require(aggregatorExists[symbol], "Aggregator not found");
        return aggregatorData[symbol].latestAnswer;
    }

    /**
     * @dev Update the answer for a symbol
     */
    function updateAnswer(string memory symbol, int256 newAnswer) public {
        require(aggregatorExists[symbol], "Aggregator not found");
        
        MockAggregatorData storage data = aggregatorData[symbol];
        data.latestAnswer = newAnswer;
        data.updatedAt = block.timestamp;
        data.roundId++;
        
        emit AnswerUpdated(symbol, newAnswer, data.roundId, block.timestamp);
    }

    /**
     * @dev Standard interface - update answer for DEFAULT aggregator
     */
    function updateAnswer(int256 newAnswer) external {
        if (aggregatorExists["DEFAULT"]) {
            updateAnswer("DEFAULT", newAnswer);
        } else {
            // Create DEFAULT aggregator if it doesn't exist
            _createMockAggregator("DEFAULT", decimals, newAnswer);
        }
    }

    /**
     * @dev Get aggregator data
     */
    function getAggregatorData(string memory symbol) 
        external 
        view 
        returns (MockAggregatorData memory) 
    {
        require(aggregatorExists[symbol], "Aggregator not found");
        return aggregatorData[symbol];
    }

    /**
     * @dev Check if aggregator exists
     */
    function hasAggregator(string memory symbol) external view returns (bool) {
        return aggregatorExists[symbol];
    }

    /**
     * @dev Batch update multiple prices
     */
    function batchUpdateAnswers(
        string[] memory symbols,
        int256[] memory newAnswers
    ) external {
        require(symbols.length == newAnswers.length, "Array length mismatch");
        require(symbols.length <= 20, "Too many updates");
        
        for (uint256 i = 0; i < symbols.length; i++) {
            if (aggregatorExists[symbols[i]]) {
                MockAggregatorData storage data = aggregatorData[symbols[i]];
                data.latestAnswer = newAnswers[i];
                data.updatedAt = block.timestamp;
                data.roundId++;
                
                emit AnswerUpdated(symbols[i], newAnswers[i], data.roundId, block.timestamp);
            }
        }
    }

    /**
     * @dev Get multiple latest answers
     */
    function getMultipleLatestAnswers(string[] memory symbols)
        external
        view
        returns (int256[] memory answers)
    {
        answers = new int256[](symbols.length);
        for (uint256 i = 0; i < symbols.length; i++) {
            if (aggregatorExists[symbols[i]]) {
                answers[i] = aggregatorData[symbols[i]].latestAnswer;
            } else {
                answers[i] = 0; // Return 0 for non-existent aggregators
            }
        }
    }

    /**
     * @dev Simulate price movement (for testing)
     */
    function simulatePriceMovement(
        string memory symbol,
        int256 percentageChange // In basis points (100 = 1%)
    ) external {
        require(aggregatorExists[symbol], "Aggregator not found");
        
        MockAggregatorData storage data = aggregatorData[symbol];
        int256 currentPrice = data.latestAnswer;
        
        // Calculate new price based on percentage change
        int256 priceChange = (currentPrice * percentageChange) / 10000;
        int256 newPrice = currentPrice + priceChange;
        
        // Ensure price doesn't go negative
        if (newPrice < 0) {
            newPrice = currentPrice / 10; // 90% drop maximum
        }
        
        data.latestAnswer = newPrice;
        data.updatedAt = block.timestamp;
        data.roundId++;
        
        emit AnswerUpdated(symbol, newPrice, data.roundId, block.timestamp);
    }

    /**
     * @dev Reset aggregator to initial state
     */
    function resetAggregator(string memory symbol, int256 resetPrice) external {
        require(aggregatorExists[symbol], "Aggregator not found");
        
        MockAggregatorData storage data = aggregatorData[symbol];
        data.latestAnswer = resetPrice;
        data.updatedAt = block.timestamp;
        data.roundId = 1;
        
        emit AnswerUpdated(symbol, resetPrice, 1, block.timestamp);
    }

    /**
     * @dev Get round data for a specific round
     */
    function getRoundData(string memory symbol, uint80 roundId)
        external
        view
        returns (
            uint80 id,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        require(aggregatorExists[symbol], "Aggregator not found");
        MockAggregatorData memory data = aggregatorData[symbol];
        
        // For simplicity, return current data for any round ID
        return (
            roundId,
            data.latestAnswer,
            data.updatedAt,
            data.updatedAt,
            roundId
        );
    }

    /**
     * @dev Standard interface - get round data for specific round
     */
    function getRoundData(uint80 roundId)
        external
        view
        returns (
            uint80 id,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        // Return data for DEFAULT aggregator or fallback
        if (aggregatorExists["DEFAULT"]) {
            return this.getRoundData("DEFAULT", roundId);
        }
        
        if (aggregatorExists["USDC"]) {
            return this.getRoundData("USDC", roundId);
        }
        
        // Fallback
        return (roundId, 100000000, block.timestamp, block.timestamp, roundId);
    }
}