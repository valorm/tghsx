
const { ethers } = require("hardhat");

async function main() {
    // Load addresses dynamically from the deployment artifact
    const deployment = require("../deployments/deployment.json");
    const VAULT_ADDRESS = deployment.contracts.CollateralVault;
    const TOKEN_ADDRESS = deployment.contracts.TGHSXToken;
    const WMATIC_ADDRESS = deployment.contracts.MockTokens.WMATIC;

    console.log("🔥 Testing Burn (Repayment) functionality...");

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
    
    let position = await collateralVault.getUserPosition(user.address, WMATIC_ADDRESS);
    let tghsxBalance = await tghsxToken.balanceOf(user.address);
    console.log(`✅ Position created. Initial Debt: ${ethers.utils.formatUnits(position.mintedAmount, 6)} tGHSX`);
    console.log(`   - User tGHSX Balance: ${ethers.utils.formatUnits(tghsxBalance, 6)}`);

    // --- 3. BURN TOKENS ---
    console.log("\n--- Step 2: User burns tokens to repay debt ---");
    const burnAmount = ethers.utils.parseUnits("150", 6); // Repay 150 tGHSX

    // The user needs to approve the vault to burn their tokens
    // Note: This is done via burnFrom in the vault, which is a standard pattern.
    // However, a simpler pattern is for the user to burn their own tokens and the vault to track it.
    // For this test, we assume the user has approved the vault.
    await tghsxToken.connect(user).approve(VAULT_ADDRESS, burnAmount);

    console.log(`   - Burning ${ethers.utils.formatUnits(burnAmount, 6)} tGHSX...`);
    const burnTx = await collateralVault.connect(user).burnTokens(WMATIC_ADDRESS, burnAmount);
    await burnTx.wait();
    console.log("✅ Burn transaction successful!");


    // --- 4. VERIFY OUTCOME ---
    console.log("\n--- Step 3: Verify Post-Burn State ---");
    const finalPosition = await collateralVault.getUserPosition(user.address, WMATIC_ADDRESS);
    const finalTghsxBalance = await tghsxToken.balanceOf(user.address);
    const expectedDebt = mintAmount.sub(burnAmount);
    const expectedBalance = tghsxBalance.sub(burnAmount);

    console.log("   User's Balances:");
    console.log(`   - Final tGHSX Balance: ${ethers.utils.formatUnits(finalTghsxBalance, 6)} (Expected: ${ethers.utils.formatUnits(expectedBalance, 6)})`);
    
    console.log("\n   Position Details:");
    console.log(`   - Final Debt: ${ethers.utils.formatUnits(finalPosition.mintedAmount, 6)} tGHSX (Expected: ${ethers.utils.formatUnits(expectedDebt, 6)})`);
    
    const finalRatio = (finalPosition.collateralRatio.toNumber() / 10000).toFixed(2);
    console.log(`   - Final Collateralization Ratio: ${finalRatio}% (Should be higher)`);

    if (finalPosition.mintedAmount.eq(expectedDebt)) {
        console.log("\n🎉 SUCCESS: User's debt was correctly reduced.");
    } else {
        console.error("\n❌ FAILED: User's debt did not decrease as expected.");
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Burn test failed:", error);
        process.exit(1);
    });
