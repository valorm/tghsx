
const { ethers } = require("hardhat");

async function main() {
    // Load addresses dynamically from the deployment artifact
    const deployment = require("../deployments/deployment.json");
    const VAULT_ADDRESS = deployment.contracts.CollateralVault;
    const TOKEN_ADDRESS = deployment.contracts.TGHSXToken;
    const WMATIC_ADDRESS = deployment.contracts.MockTokens.WMATIC;

    console.log("🔓 Testing Full Withdrawal Process...");

    // --- 1. SETUP ---
    const [admin] = await ethers.getSigners();
    const user = ethers.Wallet.createRandom().connect(ethers.provider);
    await admin.sendTransaction({ to: user.address, value: ethers.utils.parseEther("1.0") });

    console.log(`   - Admin: ${admin.address}`);
    console.log(`   - User:  ${user.address}`);

    const collateralVault = await ethers.getContractAt("CollateralVault", VAULT_ADDRESS);
    const tghsxToken = await ethers.getContractAt("TGHSXToken", TOKEN_ADDRESS);
    const wmaticToken = await ethers.getContractAt("MockERC20", WMATIC_ADDRESS);

    // --- 2. CREATE A POSITION ---
    console.log("\n--- Step 1: User creates a position ---");
    const depositAmount = ethers.utils.parseUnits("1000", 18);
    const mintAmount = ethers.utils.parseUnits("400", 6);

    await wmaticToken.connect(admin).transfer(user.address, depositAmount);
    await wmaticToken.connect(user).approve(VAULT_ADDRESS, depositAmount);
    await collateralVault.connect(user).depositCollateral(WMATIC_ADDRESS, depositAmount);
    await collateralVault.connect(user).mintTokens(WMATIC_ADDRESS, mintAmount);
    console.log("✅ Position created successfully.");

    // --- 3. ATTEMPT WITHDRAWAL WITH DEBT (SHOULD FAIL) ---
    console.log("\n--- Step 2: Attempting to withdraw with outstanding debt (should fail) ---");
    try {
        await collateralVault.connect(user).withdrawCollateral(WMATIC_ADDRESS, depositAmount);
        console.error("❌ TEST FAILED: Withdrawal succeeded when it should have failed.");
    } catch (error) {
        if (error.message.includes("reverted with custom error 'BelowMinimumRatio()'")) {
            console.log("✅ SUCCESS: Transaction correctly reverted with 'BelowMinimumRatio()' error.");
        } else {
            console.error("❌ TEST FAILED: Transaction failed, but with an unexpected error:", error.message);
        }
    }

    // --- 4. REPAY FULL DEBT ---
    console.log("\n--- Step 3: User repays full debt ---");
    const debtToRepay = await (await collateralVault.getUserPosition(user.address, WMATIC_ADDRESS)).mintedAmount;
    await tghsxToken.connect(user).approve(VAULT_ADDRESS, debtToRepay);
    await collateralVault.connect(user).burnTokens(WMATIC_ADDRESS, debtToRepay);
    console.log("✅ Full debt repaid successfully.");

    // --- 5. WITHDRAW COLLATERAL (SHOULD SUCCEED) ---
    console.log("\n--- Step 4: User withdraws collateral ---");
    const userWmaticBalanceBefore = await wmaticToken.balanceOf(user.address);
    const withdrawAmount = await (await collateralVault.getUserPosition(user.address, WMATIC_ADDRESS)).collateralAmount;
    
    await collateralVault.connect(user).withdrawCollateral(WMATIC_ADDRESS, withdrawAmount);
    console.log("✅ Collateral withdrawn successfully.");

    // --- 6. VERIFY FINAL STATE ---
    console.log("\n--- Step 5: Verifying final state ---");
    const finalPosition = await collateralVault.getUserPosition(user.address, WMATIC_ADDRESS);
    const finalWmaticBalance = await wmaticToken.balanceOf(user.address);

    console.log(`   - User's Final WMATIC Balance: ${ethers.utils.formatUnits(finalWmaticBalance, 18)}`);
    console.log("   ---------------------------------");
    console.log("   Final Position Details:");
    console.log(`   - Remaining Collateral: ${ethers.utils.formatUnits(finalPosition.collateralAmount, 18)} WMATIC`);
    console.log(`   - Remaining Debt: ${ethers.utils.formatUnits(finalPosition.mintedAmount, 6)} tGHSX`);
    
    if (finalPosition.collateralAmount.isZero() && finalPosition.mintedAmount.isZero()) {
        console.log("\n🎉 SUCCESS: User's position is empty and collateral was returned.");
    } else {
        console.error("\n❌ FAILED: User's position was not correctly cleared.");
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Withdrawal test failed:", error);
        process.exit(1);
    });
