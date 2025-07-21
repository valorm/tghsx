// scripts/test-token-automint.js
const { ethers, network } = require("hardhat");

async function main() {
    // Load addresses dynamically from the deployment artifact
    const deployment = require("../deployments/deployment.json");
    const TOKEN_ADDRESS = deployment.contracts.TGHSXToken;

    console.log("🎁 Testing Auto-Mint functionality on the TGHSXToken contract...");

    // --- 1. SETUP ACCOUNTS AND CONTRACTS ---
    const [admin] = await ethers.getSigners();
    const user = ethers.Wallet.createRandom().connect(ethers.provider);
    await admin.sendTransaction({ to: user.address, value: ethers.utils.parseEther("1.0") });

    console.log(`   - Admin: ${admin.address}`);
    console.log(`   - User:  ${user.address} (New random account)`);

    const tghsxToken = await ethers.getContractAt("TGHSXToken", TOKEN_ADDRESS);

    // --- 2. ENABLE AUTO-MINT ON THE TOKEN CONTRACT ---
    console.log("\n--- Step 1: Admin enables auto-minting ---");
    
    if (!(await tghsxToken.autoMintEnabled())) {
        const enableTx = await tghsxToken.connect(admin).toggleAutoMint(true);
        await enableTx.wait();
        console.log("✅ Auto-minting feature has been enabled on the token contract.");
    } else {
        console.log("✅ Auto-minting feature is already enabled.");
    }

    // --- 3. USER CALLS AUTOMINT ---
    console.log("\n--- Step 2: User calls autoMint on the token contract ---");
    
    const userTghsxBalanceBefore = await tghsxToken.balanceOf(user.address);
    console.log(`   - User's initial tGHSX balance: ${ethers.utils.formatUnits(userTghsxBalanceBefore, 6)}`);

    // Fast-forward time to ensure cooldown is not an issue from any previous runs by other accounts
    await network.provider.send("evm_increaseTime", [301]);
    await network.provider.send("evm_mine");
    console.log("   - Advanced time by 301 seconds.");

    const autoMintTx = await tghsxToken.connect(user).autoMint();
    await autoMintTx.wait();
    console.log("✅ autoMint transaction successful!");

    // --- 4. VERIFY OUTCOME ---
    console.log("\n--- Step 3: Verify Post-AutoMint State ---");
    const finalTghsxBalance = await tghsxToken.balanceOf(user.address);
    const autoMintConfig = await tghsxToken.autoMintConfig();
    const baseReward = autoMintConfig.baseReward;

    const expectedBalance = userTghsxBalanceBefore.add(baseReward);

    console.log(`   - Final tGHSX Balance: ${ethers.utils.formatUnits(finalTghsxBalance, 6)}`);
    console.log(`   - Expected Balance:    ${ethers.utils.formatUnits(expectedBalance, 6)}`);
    
    if (finalTghsxBalance.eq(expectedBalance)) {
        console.log("\n🎉 SUCCESS: User's tGHSX balance correctly increased by the base reward amount.");
    } else {
        console.error("\n❌ FAILED: User's balance did not increase as expected.");
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Token Auto-Mint test failed:", error);
        process.exit(1);
    });
