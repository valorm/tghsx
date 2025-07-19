const { ethers, network } = require("hardhat");

async function main() {
    // Load addresses dynamically from the deployment artifact
    const deployment = require("../deployments/localhost-deployment.json");
    const VAULT_ADDRESS = deployment.contracts.CollateralVault;
    const WMATIC_ADDRESS = deployment.contracts.MockTokens.WMATIC;

    console.log("🔄 Testing MAX_MINTS_PER_USER_PER_DAY limit...");

    // --- 1. SETUP ---
    const [admin] = await ethers.getSigners();
    const user = ethers.Wallet.createRandom().connect(ethers.provider);
    await admin.sendTransaction({ to: user.address, value: ethers.utils.parseEther("1.0") });

    console.log(`   - Admin: ${admin.address}`);
    console.log(`   - User:  ${user.address} (New random account)`);

    const collateralVault = await ethers.getContractAt("CollateralVault", VAULT_ADDRESS);
    const wmaticToken = await ethers.getContractAt("MockERC20", WMATIC_ADDRESS);

    // --- 2. DEPOSIT COLLATERAL ---
    console.log("\n--- Step 1: User deposits collateral ---");
    const depositAmount = ethers.utils.parseUnits("1000", 18); // 1,000 WMATIC
    await wmaticToken.connect(admin).transfer(user.address, depositAmount);
    await wmaticToken.connect(user).approve(VAULT_ADDRESS, depositAmount);
    await collateralVault.connect(user).depositCollateral(WMATIC_ADDRESS, depositAmount);
    console.log(`✅ User deposited ${ethers.utils.formatUnits(depositAmount, 18)} WMATIC.`);

    // --- 3. MINT UP TO THE MINT COUNT LIMIT ---
    console.log("\n--- Step 2: Minting 20 times (the daily limit) ---");
    const mintCountLimit = 20;
    const smallMintAmount = ethers.utils.parseUnits("1", 6); // 1 tGHSX

    // Grant the user the ORACLE_ROLE so they can refresh the price inside the loop
    const ORACLE_ROLE = await collateralVault.ORACLE_ROLE();
    await collateralVault.connect(admin).grantRole(ORACLE_ROLE, user.address);
    console.log("   - Granted ORACLE_ROLE to user for price refreshes.");

    for (let i = 0; i < mintCountLimit; i++) {
        // Advance time to bypass the 5-minute cooldown between mints
        await network.provider.send("evm_increaseTime", [301]);
        await network.provider.send("evm_mine");
        
        // Refresh the price feed to prevent PriceStale error
        const currentPrice = (await collateralVault.collateralConfigs(WMATIC_ADDRESS)).price;
        await collateralVault.connect(user).updatePrice(WMATIC_ADDRESS, currentPrice);

        const mintTx = await collateralVault.connect(user).mintTokens(WMATIC_ADDRESS, smallMintAmount);
        await mintTx.wait();
        console.log(`   - Mint transaction #${i + 1} successful.`);
    }

    console.log(`✅ User has now successfully minted 20 times.`);

    // --- 4. ATTEMPT TO MINT PAST THE LIMIT ---
    console.log("\n--- Step 3: Attempting to mint a 21st time (should fail) ---");
    try {
        await network.provider.send("evm_increaseTime", [301]);
        await network.provider.send("evm_mine");
        await collateralVault.connect(user).mintTokens(WMATIC_ADDRESS, smallMintAmount);
        console.error("❌ TEST FAILED: Minting succeeded when it should have failed.");
    } catch (error) {
        if (error.message.includes("reverted with custom error 'ExceedsMaxMintsPerDay()'")) {
            console.log("✅ SUCCESS: Transaction correctly reverted with 'ExceedsMaxMintsPerDay()' error.");
        } else {
            console.error("❌ TEST FAILED: Transaction failed, but with an unexpected error:", error.message);
        }
    }

    // --- 5. VERIFY FINAL STATE ---
    console.log("\n--- Step 4: Verifying final user state ---");
    const userStatus = await collateralVault.getUserMintStatus(user.address);
    const finalMintCount = userStatus.dailyMintCount;

    console.log(`   - Final daily mint count: ${finalMintCount.toString()}`);
    
    if (finalMintCount.eq(mintCountLimit)) {
        console.log("\n🎉 SUCCESS: The MAX_MINTS_PER_USER_PER_DAY limit was enforced correctly.");
    } else {
        console.error("\n❌ FAILED: The final mint count is incorrect.");
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Max Mints test failed:", error);
        process.exit(1);
    });
