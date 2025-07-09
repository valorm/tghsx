const { ethers } = require("ethers");

// IMPORTANT: Updated with the RPC URL for your local Hardhat Network
const RPC = "http://127.0.0.1:8545"; 

// IMPORTANT: Updated with your locally deployed contract addresses
const ethUsdAddress = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const usdGhsAddress = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";

const abi = [
  "function latestRoundData() view returns (uint80, int256, uint256, uint256, uint80)",
  "function description() view returns (string)",
  "function decimals() view returns (uint8)"
];

async function fetchPrice(name, address, provider) {
  try {
    const feed = new ethers.Contract(address, abi, provider);
    const [, price] = await feed.latestRoundData();
    const decimals = await feed.decimals();
    const description = await feed.description();
    
    const formattedPrice = Number(price) / Math.pow(10, decimals);
    console.log(`${name} (${description}): ${formattedPrice}`);
    return formattedPrice;
  } catch (error) {
    console.error(`❌ Error fetching ${name} from ${address}:`, error.message);
    return null;
  }
}

async function main() {
  try {
    let provider;
    
    // Method 1: Try ethers v6 syntax first
    try {
      // Check if ethers.JsonRpcProvider exists (ethers v6)
      if (ethers.JsonRpcProvider) {
        provider = new ethers.JsonRpcProvider(RPC);
        console.log("✅ Using ethers v6 JsonRpcProvider");
      } else {
        // Fallback to ethers v5 syntax if v6 is not available
        provider = new ethers.providers.JsonRpcProvider(RPC);
        console.log("✅ Using ethers v5 JsonRpcProvider");
      }
    } catch (error) {
      // If direct access or v5 fallback fails, throw error
      try { // Explicitly try v5 if v6 check or direct access failed
        provider = new ethers.providers.JsonRpcProvider(RPC);
        console.log("✅ Fallback to ethers v5 JsonRpcProvider (after initial check)");
      } catch (error2) {
        throw new Error("Failed to initialize provider. Ensure ethers.js is installed and RPC is correct.");
      }
    }

    // Test provider connection
    try {
      const network = await provider.getNetwork();
      console.log(`🌐 Connected to network: ${network.name || 'Unknown'} (Chain ID: ${network.chainId})`);
    } catch (error) {
      console.log(`🌐 Connected to RPC at ${RPC} (network details unavailable or connection issue)`);
      console.log("Please ensure your local Hardhat node is running (npx hardhat node).");
      return; // Exit if provider can't connect meaningfully
    }

    console.log("\n--- Fetching Price Data ---");
    
    // Check if placeholder addresses are still present (should not be now)
    if (ethUsdAddress.includes("YOUR_DEPLOYED_") || usdGhsAddress.includes("YOUR_DEPLOYED_")) {
        console.warn("⚠️ Warning: Please update ethUsdAddress and usdGhsAddress in checkPrice.js with actual deployed contract addresses.");
        console.warn("Run 'npx hardhat run scripts/deploy.ts --network localhost' and copy the addresses.");
        return; // Exit to prevent errors with invalid addresses
    }

    const ethUsdPrice = await fetchPrice("ETH/USD", ethUsdAddress, provider);
    const usdGhsPrice = await fetchPrice("USD/GHS", usdGhsAddress, provider);
    
    // Calculate ETH/GHS rate if both prices were fetched successfully
    if (ethUsdPrice !== null && usdGhsPrice !== null) {
      const ethGhsRate = ethUsdPrice * usdGhsPrice;
      console.log(`\n💰 Calculated ETH/GHS rate: ₵${ethGhsRate.toFixed(2)}`);
    } else {
      console.log("\n❌ Cannot calculate ETH/GHS rate due to missing price data. Check console errors above.");
    }
    
    console.log("\n--- Contract Information ---");
    console.log(`ETH/USD Mock Feed Address: ${ethUsdAddress}`);
    console.log(`USD/GHS Mock Feed Address: ${usdGhsAddress}`);
    
  } catch (error) {
    console.error("❌ Main error:", error.message);
    console.log("\n🔧 Troubleshooting tips:");
    console.log("1. Ensure your local Hardhat node is running (npx hardhat node)");
    console.log("2. Check your internet connection (if connecting to a public RPC)");
    console.log("3. Verify the RPC URL is correct and accessible");
    console.log("4. Make sure your contract addresses are correctly updated in checkPrice.js");
    console.log("5. Ensure 'ethers' is installed: npm install ethers");
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled promise rejection (checkPrice.js):', error);
});

main();