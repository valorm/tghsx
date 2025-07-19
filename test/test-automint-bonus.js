
const { ethers, network } = require("hardhat");

async function main() {
    // Load addresses dynamically from the deployment artifact
    const deployment = require("../deployments/deployment.json");
    const VAULT_ADDRESS = deployment.contracts.CollateralVault;
    const TOKEN_ADDRESS = deployment.contracts.TGHSXToken;
    const WMATIC_ADDRESS = deployment.contracts.MockTokens.WMATIC;

    console.log("🎁 Testing Auto-Mint Bonus Multiplier functionality...");

    // --- 1. SETUP ---
    const [admin] = await ethers.getSigners();
    const user = ethers.Wallet.createRandom().connect(ethers.provider);
    await admin.sendTransaction({ to: user.address, value: ethers.utils.parseEther("1.0") });

    console.log(`   - Admin: ${admin.address}`);
    console.log(`   - User:  ${user.address} (New random account)`);

    const collateralVault = await ethers.getContractAt("CollateralVault", VAULT_ADDRESS);
    const tghsxToken = await ethers.getContractAt("TGHSXToken", TOKEN_ADDRESS);
    const wmaticToken = await ethers.getContractAt("MockERC20", WMATIC_ADDRESS);

    // --- 2. ENSURE AUTOMINT IS ENABLED & CONFIGURED ---
    console.log("\n--- Step 1: Admin configures auto-mint ---");
    if (!(await collateralVault.autoMintEnabled())) {
        await collateralVault.connect(admin).toggleAutoMint(true);
        console.log("   - Auto-mint was disabled, now re-enabled for the test.");
    }
    const newBonusMultiplier = 1500; // 15%
    const currentConfig = await collateralVault.autoMintConfig();
    await collateralVault.connect(admin).updateAutoMintConfig(
        currentConfig.baseReward,
        newBonusMultiplier,
        currentConfig.minHoldTime,
        currentConfig.collateralRequirement
    );
    console.log(`✅ Bonus multiplier updated to ${newBonusMultiplier / 100}%.`);

    // --- 3. CREATE POSITION & FIRST AUTOMINT ---
    console.log("\n--- Step 2: User creates a position and performs first auto-mint ---");
    const depositAmount = ethers.utils.parseUnits("1000", 18);
    const mintAmount = ethers.utils.parseUnits("100", 6);

    await wmaticToken.connect(admin).transfer(user.address, depositAmount);
    await wmaticToken.connect(user).approve(VAULT_ADDRESS, depositAmount);
    await collateralVault.connect(user).depositCollateral(WMATIC_ADDRESS, depositAmount);
    await collateralVault.connect(user).mintTokens(WMATIC_ADDRESS, mintAmount);
    
    // Advance time to bypass the cooldown before the first auto-mint
    await network.provider.send("evm_increaseTime", [301]);
    await network.provider.send("evm_mine");

    await collateralVault.connect(user).autoMint(WMATIC_ADDRESS);
    const debtAfterFirstMint = (await collateralVault.getUserPosition(user.address, WMATIC_ADDRESS)).mintedAmount;
    console.log(`✅ First auto-mint successful. Debt is now ${ethers.utils.formatUnits(debtAfterFirstMint, 6)} tGHSX.`);

    // --- 4. ADVANCE TIME AND AUTOMINT AGAIN ---
    console.log("\n--- Step 3: Advancing time and performing second auto-mint ---");
    const holdTime = 3601; // Just over 1 hour
    await network.provider.send("evm_increaseTime", [holdTime]);
    await network.provider.send("evm_mine");
    console.log(`   - Advanced time by ${holdTime} seconds to trigger bonus.`);
    
    // --- NEW STEP: Refresh the price feed to prevent staleness ---
    console.log("   - Refreshing price feed...");
    const ORACLE_ROLE = await collateralVault.ORACLE_ROLE();
    await collateralVault.connect(admin).grantRole(ORACLE_ROLE, user.address);
    const currentPrice = (await collateralVault.collateralConfigs(WMATIC_ADDRESS)).price;
    await collateralVault.connect(user).updatePrice(WMATIC_ADDRESS, currentPrice);
    console.log("   - Price feed refreshed.");
    // --- END NEW STEP ---

    await collateralVault.connect(user).autoMint(WMATIC_ADDRESS);
    console.log("✅ Second auto-mint successful.");

    // --- 5. VERIFY OUTCOME ---
    console.log("\n--- Step 4: Verifying bonus reward ---");
    const finalPosition = await collateralVault.getUserPosition(user.address, WMATIC_ADDRESS);
    const finalDebt = finalPosition.mintedAmount;

    const updatedConfig = await collateralVault.autoMintConfig();
    const baseReward = updatedConfig.baseReward;
    const bonus = baseReward.mul(updatedConfig.bonusMultiplier).div(10000);
    const totalReward = baseReward.add(bonus);

    const expectedFinalDebt = debtAfterFirstMint.add(totalReward);

    console.log(`   - Base Reward: ${ethers.utils.formatUnits(baseReward, 6)} tGHSX`);
    console.log(`   - Bonus (15%): ${ethers.utils.formatUnits(bonus, 6)} tGHSX`);
    console.log(`   - Total Expected Reward: ${ethers.utils.formatUnits(totalReward, 6)} tGHSX`);
    console.log("   ---------------------------------");
    console.log(`   - Actual Final Debt:   ${ethers.utils.formatUnits(finalDebt, 6)} tGHSX`);
    console.log(`   - Expected Final Debt: ${ethers.utils.formatUnits(expectedFinalDebt, 6)} tGHSX`);

    if (finalDebt.eq(expectedFinalDebt)) {
        console.log("\n🎉 SUCCESS: The bonus multiplier was applied correctly.");
    } else {
        console.error("\n❌ FAILED: The final debt does not reflect the bonus reward.");
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Auto-Mint Bonus test failed:", error);
        process.exit(1);
    });
