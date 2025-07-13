import { run } from "hardhat";
import { ethers } from "hardhat";

async function main() {
  // Contract addresses from deployment
  const TGHSX_TOKEN_ADDRESS = "0xb0e6Fb0DdcBe5C8569E4Db45De0F50F9257dB860";
  const COLLATERAL_VAULT_ADDRESS = "0x056A045a98190c2843377DB216CE95479b736743";
  
  // Constructor arguments for CollateralVault
  const ETH_USD_PRICE_FEED = "0x7A6C3E338404264664368913915A20d04A253412";
  const BTC_USD_PRICE_FEED = "0x0A581C7339834253150456133955174F5D35193C";
  const DEPLOYER_ADDRESS = "0x1a0312B0453507CC412012Cc699f8d64d8219aeE";
  const INITIAL_GHS_PRICE = ethers.utils.parseUnits("10.4167", 8);

  console.log("🔍 Starting contract verification...");

  try {
    // Verify TGHSXToken (no constructor arguments)
    console.log("Verifying TGHSXToken...");
    await run("verify:verify", {
      address: TGHSX_TOKEN_ADDRESS,
      constructorArguments: [],
    });
    console.log("✅ TGHSXToken verified successfully!");
  } catch (error) {
    console.log("❌ TGHSXToken verification failed:", error);
  }

  try {
    // Verify CollateralVault (with constructor arguments)
    console.log("Verifying CollateralVault...");
    await run("verify:verify", {
      address: COLLATERAL_VAULT_ADDRESS,
      constructorArguments: [
        TGHSX_TOKEN_ADDRESS,
        ETH_USD_PRICE_FEED,
        BTC_USD_PRICE_FEED,
        DEPLOYER_ADDRESS,
        INITIAL_GHS_PRICE
      ],
    });
    console.log("✅ CollateralVault verified successfully!");
  } catch (error) {
    console.log("❌ CollateralVault verification failed:", error);
  }

  console.log("\n🎉 Verification process complete!");
  console.log(`\nView contracts on PolygonScan:`);
  console.log(`TGHSXToken: https://amoy.polygonscan.com/address/${TGHSX_TOKEN_ADDRESS}`);
  console.log(`CollateralVault: https://amoy.polygonscan.com/address/${COLLATERAL_VAULT_ADDRESS}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});