import { ethers } from "hardhat";
import "dotenv/config";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);

  // --- Deploy MockV3Aggregator for ETH/USD ---
  const ethPriceInitial = ethers.utils.parseUnits("2500", 8); // $2500 with 8 decimals
  const mockDecimals = 8;
  const ethUsdDescription = "ETH / USD Mock";

  const MockAggregatorFactory = await ethers.getContractFactory("MockV3Aggregator");
  
  console.log("Deploying MockV3Aggregator for ETH/USD...");
  const mockEthUsdPriceFeed = await MockAggregatorFactory.deploy(
    ethPriceInitial,
    mockDecimals,
    ethUsdDescription
  );
  await mockEthUsdPriceFeed.deployed();
  const ETH_USD_PRICE_FEED = mockEthUsdPriceFeed.address;
  console.log(`-> Mock ETH/USD Price Feed deployed to: ${ETH_USD_PRICE_FEED}`);

  // --- Deploy MockV3Aggregator for USD/GHS ---
  const ghsPriceInitial = ethers.utils.parseUnits("10.35", 8); // 10.35 GHS per USD
  const ghsUsdDescription = "USD / GHS Mock";
  
  console.log("Deploying MockV3Aggregator for USD/GHS...");
  const mockUsdGhsPriceFeed = await MockAggregatorFactory.deploy(
    ghsPriceInitial,
    mockDecimals,
    ghsUsdDescription
  );
  await mockUsdGhsPriceFeed.deployed();
  const USD_GHS_PRICE_FEED = mockUsdGhsPriceFeed.address;
  console.log(`-> Mock USD/GHS Price Feed deployed to: ${USD_GHS_PRICE_FEED}`);

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
    ETH_USD_PRICE_FEED,
    USD_GHS_PRICE_FEED,
    deployer.address // Treasury address
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

   // --- Grant MINTER_BURNER_ROLE to Backend Minter ---
  console.log("Granting MINTER_BURNER_ROLE to Backend Minter Account...");
  // The deployer account is the same one used as the backend minter in your .env file
  const tx2 = await tghsxToken.grantRole(MINTER_BURNER_ROLE, deployer.address);
  await tx2.wait();
  console.log(`-> MINTER_BURNER_ROLE granted successfully to backend minter: ${deployer.address}.`);

  // --- Testing Basic Functionality ---
  console.log("\n--- Verifying Basic Functionality ---");
  try {
  const depositAmountEth = ethers.utils.parseEther("1.0"); // 1 ETH
    const mintAmountTghsx = ethers.utils.parseUnits("10000", 18); // 10,000 tGHSX

    console.log(`Attempting to deposit 1 ETH and mint ${ethers.utils.formatUnits(mintAmountTghsx, 18)} tGHSX...`);
    const mintTx = await collateralVault.depositAndMint(mintAmountTghsx, {
        value: depositAmountEth
    });
    await mintTx.wait();
    console.log("✅ Deposit and Mint transaction successful!");

    // **UPDATED**: Using new view functions for verification
    const collateral = await collateralVault.getUserCollateral(deployer.address);
    const debt = await collateralVault.getUserDebt(deployer.address);
    const ratio = await collateralVault.getCollateralizationRatio(deployer.address);
    const balance = await tghsxToken.balanceOf(deployer.address);

    console.log(`\n✅ Verification successful:`);
    console.log(`-> Deployer's ETH Collateral: ${ethers.utils.formatEther(collateral)} ETH`);
    console.log(`-> Deployer's tGHSX Debt: ${ethers.utils.formatUnits(debt, 18)} tGHSX`);
    console.log(`-> Deployer's tGHSX Token Balance: ${ethers.utils.formatUnits(balance, 18)} tGHSX`);
    console.log(`-> Current Collateralization Ratio: ${ratio.toNumber() / 100}%`);


  } catch (error) {
    console.error("❌ Error during verification:", error);
  }

  // --- Log Deployed Addresses ---
  console.log("\n--- DEPLOYMENT COMPLETE ---");
  console.log(`export TGHSX_TOKEN_ADDRESS="${tghsxTokenAddress}"`);
  console.log(`export COLLATERAL_VAULT_ADDRESS="${collateralVaultAddress}"`);
  console.log(`export CHAINLINK_ETH_USD_PRICE_FEED_ADDRESS="${ETH_USD_PRICE_FEED}"`);
  console.log(`export CHAINLINK_USD_GHS_PRICE_FEED_ADDRESS="${USD_GHS_PRICE_FEED}"`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});