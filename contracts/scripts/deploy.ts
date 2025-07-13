import { ethers } from "hardhat";
import "dotenv/config";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("🚀 Deploying with Updated Synthetic Price Feed Logic...");
  console.log("Deploying contracts with the account:", deployer.address);

  // --- Deploy Mock Price Feeds with updated market data ---
  const MockAggregatorFactory = await ethers.getContractFactory("MockV3Aggregator");
  const MOCK_DECIMALS = 8;

  // 1. Deploy Mock ETH/BTC Price Feed
  // 1 ETH = 0.025 BTC
  const ethBtcPrice = ethers.utils.parseUnits("0.025", MOCK_DECIMALS);
  console.log("Deploying MockV3Aggregator for ETH/BTC with updated price...");
  const mockEthBtcPriceFeed = await MockAggregatorFactory.deploy(
    ethBtcPrice,
    MOCK_DECIMALS,
    "ETH/BTC Mock"
  );
  await mockEthBtcPriceFeed.deployed();
  const ETH_BTC_PRICE_FEED = mockEthBtcPriceFeed.address;
  console.log(`-> Mock ETH/BTC Price Feed deployed to: ${ETH_BTC_PRICE_FEED}`);

  // 2. Deploy Mock BTC/USD Price Feed
  //1 BTC = $117,669.00
  const btcUsdPrice = ethers.utils.parseUnits("117669", MOCK_DECIMALS);
  console.log("Deploying MockV3Aggregator for BTC/USD with updated price...");
  const mockBtcUsdPriceFeed = await MockAggregatorFactory.deploy(
    btcUsdPrice,
    MOCK_DECIMALS,
    "BTC/USD Mock"
  );
  await mockBtcUsdPriceFeed.deployed();
  const BTC_USD_PRICE_FEED = mockBtcUsdPriceFeed.address;
  console.log(`-> Mock BTC/USD Price Feed deployed to: ${BTC_USD_PRICE_FEED}`);

  // --- Define an updated initial price for GHS/USD ---
  //1 GHS = 0.096 USD => 1 USD = 1 / 0.096 = 10.4166... GHS
  const initialGhsPrice = ethers.utils.parseUnits("10.4167", MOCK_DECIMALS);
  console.log(`Setting initial GHS/USD price to 10.4167`);

  // --- Deploy TGHSXToken ---
  const TGHSXTokenFactory = await ethers.getContractFactory("TGHSXToken");
  console.log("Deploying TGHSXToken...");
  const tghsxToken = await TGHSXTokenFactory.deploy();
  await tghsxToken.deployed();
  const tghsxTokenAddress = tghsxToken.address;
  console.log(`-> TGHSXToken deployed to: ${tghsxTokenAddress}`);

  // --- Deploy CollateralVault ---
  const CollateralVaultFactory = await ethers.getContractFactory("CollateralVault");
  console.log("Deploying CollateralVault...");
  const collateralVault = await CollateralVaultFactory.deploy(
    tghsxTokenAddress,
    ETH_BTC_PRICE_FEED,
    BTC_USD_PRICE_FEED,
    deployer.address, // Treasury address
    initialGhsPrice
  );
  await collateralVault.deployed();
  const collateralVaultAddress = collateralVault.address;
  console.log(`-> CollateralVault deployed to: ${collateralVaultAddress}`);

  // --- Grant MINTER_BURNER_ROLE to CollateralVault ---
  console.log("Granting MINTER_BURNER_ROLE to CollateralVault...");
  const MINTER_BURNER_ROLE = await tghsxToken.MINTER_BURNER_ROLE();
  const tx = await tghsxToken.grantRole(MINTER_BURNER_ROLE, collateralVaultAddress);
  await tx.wait();
  console.log("-> MINTER_BURNER_ROLE granted successfully.");

  console.log("\n--- DEPLOYMENT COMPLETE ---");
  console.log(`\n--- Deployed Addresses ---`);
  console.log(`export TGHSX_TOKEN_ADDRESS="${tghsxTokenAddress}"`);
  console.log(`export COLLATERAL_VAULT_ADDRESS="${collateralVaultAddress}"`);
  console.log(`export MOCK_ETH_BTC_PRICE_FEED_ADDRESS="${ETH_BTC_PRICE_FEED}"`);
  console.log(`export MOCK_BTC_USD_PRICE_FEED_ADDRESS="${BTC_USD_PRICE_FEED}"`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
