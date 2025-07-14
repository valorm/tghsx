import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "dotenv/config";

// Debug: Log environment variables
console.log("=== DEBUG INFO ===");
console.log("POLYGON_AMOY_RPC_URL:", process.env.POLYGON_AMOY_RPC_URL);
console.log("PRIVATE_KEY exists:", !!process.env.PRIVATE_KEY);
console.log("Current working directory:", process.cwd());
console.log("=== END DEBUG ===");

const POLYGON_AMOY_RPC_URL = process.env.POLYGON_AMOY_RPC_URL || "";
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const POLYGONSCAN_API_KEY = process.env.POLYGONSCAN_API_KEY;

// Additional debug
console.log("Final POLYGON_AMOY_RPC_URL value:", POLYGON_AMOY_RPC_URL);
console.log("URL length:", POLYGON_AMOY_RPC_URL.length);

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    amoy: {
      url: POLYGON_AMOY_RPC_URL,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      chainId: 80002, // Polygon Amoy Chain ID
    },
    hardhat: { // Keep hardhat network for local testing
      chainId: 31337,
    },
  },
  etherscan: {
    apiKey: {
      amoy: POLYGONSCAN_API_KEY || "",
    },
    customChains: [
      {
        network: "amoy",
        chainId: 80002,
        urls: {
          apiURL: "https://api-amoy.polygonscan.com/api",
          browserURL: "https://amoy.polygonscan.com"
        }
      }
    ]
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: "USD",
    outputFile: "gas-report.txt",
    noColors: true,
  },
  paths: {
    sources: "./contracts",
    cache: "./cache",
    artifacts: "./artifacts",
  }
};

export default config;