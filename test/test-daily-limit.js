
const { ethers, network } = require("hardhat");

async function main() {
    // Load addresses dynamically from the deployment artifact
    const deployment = require("../deployments/deployment.json");
    const VAULT_ADDRESS = deployment.contracts.CollateralVault;
    const WMATIC_ADDRESS = deployment.contracts.MockTokens.WMATIC;

    console.log("📈 Testing MAX_MINT_PER_DAY limit...");

    // --- 1. SETUP ---
    const [admin] = await ethers.getSigners();
    const user = ethers.Wallet.createRandom().connect(ethers.provider);
    await admin.sendTransaction({ to: user.address, value: ethers.utils.parseEther("1.0") });

    console.log(`   - Admin: ${admin.address}`);
    console.log(`   - User:  ${user.address} (New random account)`);

    const collateralVault = await ethers.getContractAt("CollateralVault", VAULT_ADDRESS);
    const wmaticToken = await ethers.getContractAt("MockERC20", WMATIC_ADDRESS);

    // --- 2. DEPOSIT A LARGE AMOUNT OF COLLATERAL ---
    console.log("\n--- Step 1: User deposits a large amount of collateral ---");
    const depositAmount = ethers.utils.parseUnits("15000", 18); // 15,000 WMATIC
    await wmaticToken.connect(admin).transfer(user.address, depositAmount);
    await wmaticToken.connect(user).approve(VAULT_ADDRESS, depositAmount);
    await collateralVault.connect(user).depositCollateral(WMATIC_ADDRESS, depositAmount);
    console.log(`✅ User deposited ${ethers.utils.formatUnits(depositAmount, 18)} WMATIC.`);

    // --- 3. MINT UP TO THE DAILY LIMIT ---
    console.log("\n--- Step 2: Minting up to the 5,000 tGHSX daily limit ---");
    const maxSingleMint = ethers.utils.parseUnits("1000", 6); // 1,000 tGHSX
    const maxDailyMint = ethers.utils.parseUnits("5000", 6);

    // Grant the user the ORACLE_ROLE so they can refresh the price inside the loop
    const ORACLE_ROLE = await collateralVault.ORACLE_ROLE();
    await collateralVault.connect(admin).grantRole(ORACLE_ROLE, user.address);
    console.log("   - Granted ORACLE_ROLE to user for price refreshes.");

    for (let i = 0; i < 5; i++) {
        // Advance time to bypass the 5-minute cooldown between mints
        await network.provider.send("evm_increaseTime", [301]);
        await network.provider.send("evm_mine");
        
        // Refresh the price feed to prevent PriceStale error
        const currentPrice = (await collateralVault.collateralConfigs(WMATIC_ADDRESS)).price;
        await collateralVault.connect(user).updatePrice(WMATIC_ADDRESS, currentPrice);

        const mintTx = await collateralVault.connect(user).mintTokens(WMATIC_ADDRESS, maxSingleMint);
        await mintTx.wait();
        console.log(`   - Mint transaction #${i + 1} successful (1,000 tGHSX).`);
    }

    let userStatus = await collateralVault.getUserMintStatus(user.address);
    console.log(`✅ User has now minted a total of ${ethers.utils.formatUnits(userStatus.dailyMinted, 6)} tGHSX.`);

    // --- 4. ATTEMPT TO MINT PAST THE LIMIT ---
    console.log("\n--- Step 3: Attempting to mint past the limit (should fail) ---");
    try {
        const smallMintAmount = ethers.utils.parseUnits("1", 6); // 1 tGHSX
        await network.provider.send("evm_increaseTime", [301]);
        await network.provider.send("evm_mine");
        await collateralVault.connect(user).mintTokens(WMATIC_ADDRESS, smallMintAmount);
        console.error("❌ TEST FAILED: Minting succeeded when it should have failed.");
    } catch (error) {
        if (error.message.includes("reverted with custom error 'ExceedsDailyLimit()'")) {
            console.log("✅ SUCCESS: Transaction correctly reverted with 'ExceedsDailyLimit()' error.");
        } else {
            console.error("❌ TEST FAILED: Transaction failed, but with an unexpected error:", error.message);
        }
    }

    // --- 5. VERIFY FINAL STATE ---
    console.log("\n--- Step 4: Verifying final user state ---");
    userStatus = await collateralVault.getUserMintStatus(user.address);
    const finalMinted = userStatus.dailyMinted;

    console.log(`   - Final daily minted amount: ${ethers.utils.formatUnits(finalMinted, 6)} tGHSX`);
    
    if (finalMinted.eq(maxDailyMint)) {
        console.log("\n🎉 SUCCESS: The MAX_MINT_PER_DAY limit was enforced correctly.");
    } else {
        console.error("\n❌ FAILED: The final minted amount is incorrect.");
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Daily Limit test failed:", error);
        process.exit(1);
    });
