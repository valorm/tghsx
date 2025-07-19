
const { ethers, network } = require("hardhat");

async function main() {
    // Load addresses dynamically from the deployment artifact
    const deployment = require("../deployments/deployment.json");
    const VAULT_ADDRESS = deployment.contracts.CollateralVault;
    const WMATIC_ADDRESS = deployment.contracts.MockTokens.WMATIC;

    console.log("❄️  Testing Auto-Mint Cooldown functionality...");

    // --- 1. SETUP ---
    const [admin] = await ethers.getSigners();
    const user = ethers.Wallet.createRandom().connect(ethers.provider);
    await admin.sendTransaction({ to: user.address, value: ethers.utils.parseEther("1.0") });

    console.log(`   - Admin: ${admin.address}`);
    console.log(`   - User:  ${user.address} (New random account)`);

    const collateralVault = await ethers.getContractAt("CollateralVault", VAULT_ADDRESS);
    const wmaticToken = await ethers.getContractAt("MockERC20", WMATIC_ADDRESS);

    // --- 2. CREATE A HEALTHY POSITION ---
    console.log("\n--- Step 1: User creates a healthy position ---");
    const depositAmount = ethers.utils.parseUnits("1000", 18);
    const mintAmount = ethers.utils.parseUnits("100", 6);

    await wmaticToken.connect(admin).transfer(user.address, depositAmount);
    await wmaticToken.connect(user).approve(VAULT_ADDRESS, depositAmount);
    await collateralVault.connect(user).depositCollateral(WMATIC_ADDRESS, depositAmount);
    await collateralVault.connect(user).mintTokens(WMATIC_ADDRESS, mintAmount);
    console.log("✅ Position created successfully.");

    // --- 3. FIRST AUTOMINT CALL ---
    console.log("\n--- Step 2: User calls autoMint for the first time ---");
    
    // CORRECTED: Advance time to bypass the cooldown from the initial mintTokens call.
    console.log("   - Advancing time by 301 seconds to bypass initial cooldown...");
    await network.provider.send("evm_increaseTime", [301]);
    await network.provider.send("evm_mine");

    await collateralVault.connect(user).autoMint(WMATIC_ADDRESS);
    console.log("✅ First auto-mint call successful. Cooldown timer restarted.");

    // --- 4. SECOND AUTOMINT CALL (SHOULD FAIL) ---
    console.log("\n--- Step 3: User immediately calls autoMint again (should fail) ---");
    try {
        await collateralVault.connect(user).autoMint(WMATIC_ADDRESS);
        console.error("❌ TEST FAILED: autoMint() succeeded when it should have failed due to cooldown.");
    } catch (error) {
        if (error.message.includes("reverted with custom error 'CooldownNotMet()'")) {
            console.log("✅ SUCCESS: Transaction correctly reverted with 'CooldownNotMet()' error.");
        } else {
            console.error("❌ TEST FAILED: Transaction failed, but with an unexpected error:", error.message);
        }
    }

    console.log("\n🎉 Auto-mint cooldown test complete!");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Test script failed:", error);
        process.exit(1);
    });
