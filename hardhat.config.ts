// hardhat.config.js
require("@nomicfoundation/hardhat-toolbox"); // provides the verify task
require("dotenv").config();

// Load environment variables
const POLYGON_AMOY_RPC_URL = process.env.POLYGON_AMOY_RPC_URL;
const PRIVATE_KEY          = process.env.PRIVATE_KEY;
const POLYGONSCAN_API_KEY  = process.env.POLYGONSCAN_API_KEY;

// Validate required env vars
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
    version: "0.8.20",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },

  networks: {
    hardhat: {},
    amoy: {
      url: POLYGON_AMOY_RPC_URL,
      accounts: [PRIVATE_KEY],
      chainId: 80002,
    },
  },

  etherscan: {
    apiKey: {
      // must match the --network name
      amoy: POLYGONSCAN_API_KEY,
    },
    customChains: [
      {
        network: "amoy",
        chainId: 80002,
        urls: {
          apiURL:     "https://api-amoy.polygonscan.com/api",
          browserURL: "https://amoy.polygonscan.com",
        },
      },
    ],
  },
};