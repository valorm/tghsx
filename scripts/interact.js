// scripts/interact.js
const { ethers } = require("hardhat");

// --- YOUR DEPLOYED ADDRESSES ---
const collateralVaultAddress = "0xbFA4883C7D9dE2b2A8BAb691F555302E0A20882d";
const wmaticTokenAddress = "0xF0Fb3f5fdBb8331B7De58e942472FB4060c2E97B";
// -------------------------------

async function main() {
    const [account] = await ethers.getSigners();
    console.log("🎬 Interacting with contracts using account:", account.address);

    const collateralVault = await ethers.getContractAt("CollateralVault", collateralVaultAddress);
    const wmaticToken = await ethers.getContractAt("MockERC20", wmaticTokenAddress);

    // Amounts to use (with correct decimals)
    const depositAmount = ethers.utils.parseUnits("1000", 18); // 1,000 WMATIC
    const mintAmount = ethers.utils.parseUnits("400", 6); // 400 tGHSX

    console.log(`\n1. Approving Vault to spend ${ethers.utils.formatUnits(depositAmount, 18)} WMATIC...`);
    const approveTx = await wmaticToken.approve(collateralVault.address, depositAmount);
    await approveTx.wait();
    console.log("✅ Approval successful.");

    console.log(`\n2. Depositing ${ethers.utils.formatUnits(depositAmount, 18)} WMATIC into the Vault...`);
    const depositTx = await collateralVault.depositCollateral(wmaticToken.address, depositAmount);
    await depositTx.wait();
    console.log("✅ Deposit successful.");

    // --- 🕵️‍♂️ ADDED DEBUGGING LOGS ---
    console.log("\n--- 🕵️‍♂️ Pre-Mint Diagnostics ---");
    const userStatus = await collateralVault.getUserMintStatus(account.address);
    const vaultStatus = await collateralVault.getVaultStatus();
    const position = await collateralVault.getUserPosition(account.address, wmaticToken.address);

    console.log("User Status:");
    console.log(`  - Cooldown Remaining: ${userStatus.cooldownRemaining.toString()} seconds`);
    console.log(`  - Daily Mint Count: ${userStatus.dailyMintCount.toString()}`);
    console.log(`  - Daily Minted: ${ethers.utils.formatUnits(userStatus.dailyMinted, 6)} tGHSX`);
    console.log("Vault Status:");
    console.log(`  - Global Daily Minted: ${ethers.utils.formatUnits(vaultStatus.dailyMinted, 6)} tGHSX`);
    console.log("Position Status:");
    console.log(`  - Collateral Value: $${(position.collateralValue / 1e6).toFixed(2)}`);
    console.log(`  - Required Collateral for Mint: $${((mintAmount * 150) / 100 / 1e6).toFixed(2)}`);
    console.log("--------------------------------\n");
    // --- END DEBUGGING LOGS ---

    console.log(`3. Minting ${ethers.utils.formatUnits(mintAmount, 6)} tGHSX...`);
    const mintTx = await collateralVault.mintTokens(wmaticToken.address, mintAmount);
    await mintTx.wait();
    console.log("✅ Minting successful.");

    console.log("\n4. Checking user position...");
    const finalPosition = await collateralVault.getUserPosition(account.address, wmaticToken.address);
    console.log("   - Collateral Deposited:", ethers.utils.formatUnits(finalPosition.collateralAmount, 18), "WMATIC");
    console.log("   - tGHSX Minted:", ethers.utils.formatUnits(finalPosition.mintedAmount, 6), "tGHSX");
    console.log("   - Collateralization Ratio:", (finalPosition.collateralRatio / 1e6).toFixed(2), "%");

    console.log("\n🎉 Interaction complete!");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Interaction failed:", error);
        process.exit(1);
    });