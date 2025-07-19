
const { ethers, network } = require("hardhat");

// --- Configuration ---
// Load addresses dynamically from the deployment artifact
const deployment = require("../deployments/deployment.json");
const VAULT_ADDRESS = deployment.contracts.CollateralVault;
const WMATIC_ADDRESS = deployment.contracts.MockTokens.WMATIC;
// ---------------------

async function main() {
    console.log("👑 Testing Advanced Admin Functions on Localhost...");

    // --- 1. SETUP ---
    const [admin] = await ethers.getSigners();
    const user = ethers.Wallet.createRandom().connect(ethers.provider);
    await admin.sendTransaction({ to: user.address, value: ethers.utils.parseEther("1.0") });

    console.log(`   - Admin: ${admin.address}`);
    console.log(`   - User:  ${user.address}`);

    const collateralVault = await ethers.getContractAt("CollateralVault", VAULT_ADDRESS);
    const wmaticToken = await ethers.getContractAt("MockERC20", WMATIC_ADDRESS);

    // --- 2. TEST emergencyResetUserLimits ---
    console.log("\n--- Testing emergencyResetUserLimits() ---");
    
    // a) User creates a position and mints
    const depositAmount = ethers.utils.parseUnits("1000", 18);
    await wmaticToken.connect(admin).transfer(user.address, depositAmount);
    await wmaticToken.connect(user).approve(VAULT_ADDRESS, depositAmount);
    await collateralVault.connect(user).depositCollateral(WMATIC_ADDRESS, depositAmount);
    await collateralVault.connect(user).mintTokens(WMATIC_ADDRESS, ethers.utils.parseUnits("100", 6));
    
    let userStatus = await collateralVault.getUserMintStatus(user.address);
    console.log(`   - User's daily minted before reset: ${ethers.utils.formatUnits(userStatus.dailyMinted, 6)} tGHSX`);

    // b) Admin resets the user's limits
    console.log("   - Admin is resetting the user's daily limits...");
    const resetUserTx = await collateralVault.connect(admin).emergencyResetUserLimits(user.address);
    await resetUserTx.wait();

    // c) Verify the user's limits are reset
    userStatus = await collateralVault.getUserMintStatus(user.address);
    console.log(`   - User's daily minted after reset: ${ethers.utils.formatUnits(userStatus.dailyMinted, 6)} tGHSX`);
    if (userStatus.dailyMinted.isZero()) {
        console.log("   ✅ SUCCESS: User's daily limit was correctly reset.");
    } else {
        console.error("   ❌ FAILED: User's daily limit was not reset.");
    }

    // --- 3. TEST emergencyResetGlobalLimits ---
    console.log("\n--- Testing emergencyResetGlobalLimits() ---");
    let vaultStatus = await collateralVault.getVaultStatus();
    console.log(`   - Global daily minted before reset: ${ethers.utils.formatUnits(vaultStatus.dailyMinted, 6)} tGHSX`);

    // a) Admin resets the global limits
    console.log("   - Admin is resetting the global daily limits...");
    const resetGlobalTx = await collateralVault.connect(admin).emergencyResetGlobalLimits();
    await resetGlobalTx.wait();

    // b) Verify the global limits are reset
    vaultStatus = await collateralVault.getVaultStatus();
    console.log(`   - Global daily minted after reset: ${ethers.utils.formatUnits(vaultStatus.dailyMinted, 6)} tGHSX`);
    if (vaultStatus.dailyMinted.isZero()) {
        console.log("   ✅ SUCCESS: Global daily limit was correctly reset.");
    } else {
        console.error("   ❌ FAILED: Global daily limit was not reset.");
    }

    // --- 4. TEST updateAutoMintConfig ---
    console.log("\n--- Testing updateAutoMintConfig() ---");
    let autoMintConfig = await collateralVault.autoMintConfig();
    console.log(`   - Base reward before update: ${ethers.utils.formatUnits(autoMintConfig.baseReward, 6)} tGHSX`);

    // a) Admin updates the auto-mint configuration
    const newBaseReward = ethers.utils.parseUnits("25", 6); // 25 tGHSX
    const newBonusMultiplier = 1000; // 10%
    const newMinHoldTime = 7200; // 2 hours
    const newCollateralRequirement = ethers.utils.parseUnits("2.5", 6); // 250%

    console.log("   - Admin is updating the auto-mint configuration...");
    const updateConfigTx = await collateralVault.connect(admin).updateAutoMintConfig(
        newBaseReward,
        newBonusMultiplier,
        newMinHoldTime,
        newCollateralRequirement
    );
    await updateConfigTx.wait();

    // b) Verify the new configuration
    autoMintConfig = await collateralVault.autoMintConfig();
    console.log(`   - Base reward after update: ${ethers.utils.formatUnits(autoMintConfig.baseReward, 6)} tGHSX`);
    console.log(`   - Bonus multiplier after update: ${autoMintConfig.bonusMultiplier}`);
    
    if (autoMintConfig.baseReward.eq(newBaseReward) && autoMintConfig.bonusMultiplier.eq(newBonusMultiplier)) {
        console.log("   ✅ SUCCESS: Auto-mint configuration was correctly updated.");
    } else {
        console.error("   ❌ FAILED: Auto-mint configuration was not updated correctly.");
    }

    console.log("\n\n🎉 Advanced Admin Functions test complete!");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Test failed:", error);
        process.exit(1);
    });
