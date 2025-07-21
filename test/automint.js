const { ethers } = require("hardhat");
const fs = require("fs");
require("dotenv").config();

async function main() {
  console.log("🎁 Testing Auto-Mint functionality on the CollateralVault...");

  // Load deployed contract addresses from JSON file
  const deployed = JSON.parse(fs.readFileSync("./deployments/amoy.json", "utf8"));

  const [admin] = await ethers.getSigners();
  console.log("   - Admin:", admin.address);

  // Connect to already deployed contracts
  const CollateralVault = await ethers.getContractAt("CollateralVault", deployed.contracts.CollateralVault);
  const TGHSXToken = await ethers.getContractAt("TGHSXToken", deployed.contracts.TGHSXToken);
  const WETH = await ethers.getContractAt("MockToken", deployed.contracts.MockTokens.WETH);

  // 1. Approve CollateralVault to spend WETH on behalf of admin
  const mintAmount = ethers.utils.parseEther("10"); // 10 ETH worth

  const approveTx = await WETH.approve(CollateralVault.address, mintAmount);
  await approveTx.wait();
  console.log("✅ Approved WETH spending for CollateralVault");

  // 2. Call depositAndMint
  const tx = await CollateralVault.depositAndMint(WETH.address, mintAmount);
  const receipt = await tx.wait();
  console.log("✅ Minted tGHSX successfully");

  // 3. Check tGHSX balance
  const balance = await TGHSXToken.balanceOf(admin.address);
  console.log("🏦 tGHSX balance:", ethers.utils.formatEther(balance));
}

main().catch((err) => {
  console.error("❌ Auto-Mint test failed:", err);
  process.exit(1);
});
