import { ethers } from "hardhat";
import "dotenv/config";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("🚀 Deploying with LIVE Chainlink Price Feeds on Amoy...");
  console.log("Deploying contracts with the account:", deployer.address);

  // --- Using LIVE Chainlink Price Feeds on Amoy Testnet ---

  const ETH_USD_PRICE_FEED = ethers.utils.getAddress("0x7A6C3E338404264664368913915A20d04A253412"); // Live ETH/USD on Amoy
  const BTC_USD_PRICE_FEED = ethers.utils.getAddress("0x0A581C7339834253150456133955174F5D35193C"); // Live BTC/USD on Amoy
  
  console.log(`Using Live ETH/USD Feed at: ${ETH_USD_PRICE_FEED}`);
  console.log(`Using Live BTC/USD Feed at: ${BTC_USD_PRICE_FEED}`);

  // --- Define an initial price for GHS/USD ---
  const initialGhsPrice = ethers.utils.parseUnits("10.4167", 8); // 8 decimals
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
    ETH_USD_PRICE_FEED, // The contract expects the ETH feed first
    BTC_USD_PRICE_FEED, // The contract expects the BTC feed second
    deployer.address,   // Treasury address
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
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});