// scripts/test-automint.js
const { ethers, network } = require("hardhat");

async function main() {
    // Load addresses dynamically from the deployment artifact
    const deployment = require("../deployments/deployment.json");
    const VAULT_ADDRESS = deployment.contracts.CollateralVault;
    const TOKEN_ADDRESS = deployment.contracts.TGHSXToken;
    const WMATIC_ADDRESS = deployment.contracts.MockTokens.WMATIC;

    console.log("🎁 Testing Auto-Mint functionality on the CollateralVault...");

    // --- 1. SETUP ---
    const [admin] = await ethers.getSigners();
    const user = ethers.Wallet.createRandom().connect(ethers.provider);
    await admin.sendTransaction({ to: user.address, value: ethers.utils.parseEther("1.0") });

    console.log(`   - Admin: ${admin.address}`);
    console.log(`   - User:  ${user.address} (New random account)`);

    const collateralVault = await ethers.getContractAt("CollateralVault", VAULT_ADDRESS);
    const tghsxToken = await ethers.getContractAt("TGHSXToken", TOKEN_ADDRESS);
    const wmaticToken = await ethers.getContractAt("MockERC20", WMATIC_ADDRESS);

    // --- 2. CREATE A HIGHLY-COLLATERALIZED POSITION ---
    console.log("\n--- Step 1: User creates a healthy position ---");
    const depositAmount = ethers.utils.parseUnits("1000", 18); // 1,000 WMATIC
    const mintAmount = ethers.utils.parseUnits("100", 6);    // 100 tGHSX

    await wmaticToken.connect(admin).transfer(user.address, depositAmount);
    
    await wmaticToken.connect(user).approve(VAULT_ADDRESS, depositAmount);
    await collateralVault.connect(user).depositCollateral(WMATIC_ADDRESS, depositAmount);
    await collateralVault.connect(user).mintTokens(WMATIC_ADDRESS, mintAmount);
    
    let position = await collateralVault.getUserPosition(user.address, WMATIC_ADDRESS);
    let ratio = (position.collateralRatio.toNumber() / 10000).toFixed(2);
    console.log(`✅ Position created. Initial Ratio: ${ratio}% (Well above 200% requirement)`);

    // --- 3. CALL AUTOMINT ---
    console.log("\n--- Step 2: User calls autoMint ---");
    
    // Fast-forward time to ensure cooldown is not an issue
    await network.provider.send("evm_increaseTime", [301]);
    await network.provider.send("evm_mine");
    console.log("   - Advanced time by 301 seconds.");

    const autoMintTx = await collateralVault.connect(user).autoMint(WMATIC_ADDRESS);
    await autoMintTx.wait();
    console.log("✅ autoMint transaction successful!");

    // --- 4. VERIFY OUTCOME ---
    console.log("\n--- Step 3: Verify Post-AutoMint State ---");
    const finalPosition = await collateralVault.getUserPosition(user.address, WMATIC_ADDRESS);
    const finalTghsxBalance = await tghsxToken.balanceOf(user.address);
    const autoMintConfig = await collateralVault.autoMintConfig();
    const baseReward = autoMintConfig.baseReward;

    const expectedDebt = mintAmount.add(baseReward);

    console.log("   User's Balances:");
    console.log(`   - tGHSX Balance: ${ethers.utils.formatUnits(finalTghsxBalance, 6)} (Expected ~110)`);
    
    console.log("\n   Position Details:");
    console.log(`   - Final Debt: ${ethers.utils.formatUnits(finalPosition.mintedAmount, 6)} tGHSX (Expected ${ethers.utils.formatUnits(expectedDebt, 6)})`);
    
    if (finalPosition.mintedAmount.eq(expectedDebt)) {
        console.log("\n🎉 SUCCESS: User's debt correctly increased by the base reward amount.");
    } else {
        console.error("\n❌ FAILED: User's debt did not increase as expected.");
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Auto-Mint test failed:", error);
        process.exit(1);
    });
