import { ethers } from "hardhat";
import "dotenv/config";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("🚀 Deploying The Ghana Stablecoin (tGHSX) Protocol with Recommended Hybrid Oracle...");
  console.log("Deploying contracts with the account:", deployer.address);

  // --- Define LIVE Chainlink Price Feed Address for ETH/USD on Polygon Amoy ---
  // This is the secure, decentralized oracle for our main collateral.
  const ETH_USD_PRICE_FEED = "0x0715A7794a1dc8e42615F059dD6e406A6594651A"; 
  console.log(`Using live ETH/USD Price Feed at: ${ETH_USD_PRICE_FEED}`);

  // --- Define an initial price for GHS/USD to be set by the owner ---
  // This will be set at deployment and can be updated later.
  // Using the price from the image provided: 10.39 GHS per USD.
  const initialGhsPrice = ethers.utils.parseUnits("10.39", 8); // 8 decimals for price feeds
  console.log(`Setting initial GHS/USD price to 10.39`);

  // --- Deploy TGHSXToken ---
  const TGHSXTokenFactory = await ethers.getContractFactory("TGHSXToken");
  console.log("Deploying TGHSXToken...");
  const tghsxToken = await TGHSXTokenFactory.deploy();
  await tghsxToken.deployed();
  const tghsxTokenAddress = tghsxToken.address;
  console.log(`-> TGHSXToken deployed to: ${tghsxTokenAddress}`);

  // --- Deploy CollateralVault ---
  // We pass the live ETH/USD feed and the initial GHS price.
  const CollateralVaultFactory = await ethers.getContractFactory("CollateralVault");
  console.log("Deploying CollateralVault...");
  const collateralVault = await CollateralVaultFactory.deploy(
    tghsxTokenAddress,
    ETH_USD_PRICE_FEED,
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

  // --- Log Deployed Addresses ---
  console.log("\n--- DEPLOYMENT COMPLETE ---");
  console.log(`export TGHSX_TOKEN_ADDRESS="${tghsxTokenAddress}"`);
  console.log(`export COLLATERAL_VAULT_ADDRESS="${collateralVaultAddress}"`);
  console.log(`\nTo update the GHS price, call the 'updateGhsPrice' function on the CollateralVault contract as the owner.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
