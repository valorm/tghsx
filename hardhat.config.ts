require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();
require("hardhat-gas-reporter");

// Load environment variables
const POLYGON_AMOY_RPC_URL = process.env.POLYGON_AMOY_RPC_URL;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const POLYGONSCAN_API_KEY = process.env.POLYGONSCAN_API_KEY;
const COINMARKETCAP_API_KEY = process.env.COINMARKETCAP_API_KEY;

// Validate critical environment variables
if (!POLYGON_AMOY_RPC_URL) {
  throw new Error("❌ Missing POLYGON_AMOY_RPC_URL in .env");
}
if (!PRIVATE_KEY) {
  throw new Error("❌ Missing PRIVATE_KEY in .env");
}
if (!POLYGONSCAN_API_KEY) {
  throw new Error("❌ Missing POLYGONSCAN_API_KEY in .env");
}

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.26",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },

  networks: {
    // In-memory local Hardhat network
    hardhat: {
      chainId: 31337,
    },

    // Localhost network 
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
    },

    // Polygon Amoy Testnet
    amoy: {
      url: POLYGON_AMOY_RPC_URL,
      accounts: [PRIVATE_KEY],
      chainId: 80002,
    },
  },

  etherscan: {
    apiKey: {
      amoy: POLYGONSCAN_API_KEY,
    },
    customChains: [
      {
        network: "amoy",
        chainId: 80002,
        urls: {
          apiURL: "https://api-amoy.polygonscan.com/api",
          browserURL: "https://amoy.polygonscan.com",
        },
      },
    ],
  },

  // Gas usage tracking
  gasReporter: {
    enabled: true,
    currency: "USD",
    coinmarketcap: COINMARKETCAP_API_KEY || "",
    token: "MATIC",
    gasPriceApi: "https://api.polygonscan.com/api?module=proxy&action=eth_gasPrice",
    showTimeSpent: true,
    excludeContracts: [],
  },
};