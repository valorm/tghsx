// In scripts/updatePrice.ts
import { ethers } from "hardhat";
import "dotenv/config";

async function main() {
  const ethUsdPriceFeedAddress = process.env.CHAINLINK_ETH_USD_PRICE_FEED_ADDRESS;
  if (!ethUsdPriceFeedAddress) {
    throw new Error("Price feed address not found in .env file");
  }

  console.log(`Attaching to MockV3Aggregator at: ${ethUsdPriceFeedAddress}`);
  const priceFeed = await ethers.getContractAt("MockV3Aggregator", ethUsdPriceFeedAddress);

  // New price: $1,500 (with 8 decimals, as required by the mock contract)
  const newPrice = ethers.utils.parseUnits("1", 8);

  console.log("Updating mock ETH/USD price to $1...");
  const tx = await priceFeed.updateAnswer(newPrice);
  await tx.wait();

  console.log("✅ Price updated successfully!");
  const latestRoundData = await priceFeed.latestRoundData();
  console.log(`New price is: ${ethers.utils.formatUnits(latestRoundData.answer, 8)} USD`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});