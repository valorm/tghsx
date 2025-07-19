
const { ethers } = require("hardhat");

async function main() {
    // Load addresses dynamically from the deployment artifact
    const deployment = require("../deployments/deployment.json");
    const TOKEN_ADDRESS = deployment.contracts.TGHSXToken;

    console.log("📦 Testing Batch Mint functionality on the TGHSXToken contract...");

    // --- 1. SETUP ACCOUNTS AND CONTRACTS ---
    const [admin] = await ethers.getSigners();
    const user1 = ethers.Wallet.createRandom().connect(ethers.provider);
    const user2 = ethers.Wallet.createRandom().connect(ethers.provider);

    console.log(`   - Admin (Minter): ${admin.address}`);
    console.log(`   - Recipient 1:    ${user1.address}`);
    console.log(`   - Recipient 2:    ${user2.address}`);

    const tghsxToken = await ethers.getContractAt("TGHSXToken", TOKEN_ADDRESS);

    // --- 2. GRANT MINTER_BURNER_ROLE TO ADMIN ---
    console.log("\n--- Step 1: Admin grants itself the MINTER_BURNER_ROLE ---");
    const MINTER_BURNER_ROLE = await tghsxToken.MINTER_BURNER_ROLE();
    
    if (!(await tghsxToken.hasRole(MINTER_BURNER_ROLE, admin.address))) {
        const grantRoleTx = await tghsxToken.connect(admin).grantRole(MINTER_BURNER_ROLE, admin.address);
        await grantRoleTx.wait();
        console.log("✅ MINTER_BURNER_ROLE granted to admin successfully.");
    } else {
        console.log("✅ Admin already has the MINTER_BURNER_ROLE.");
    }

    // --- 3. PREPARE AND EXECUTE BATCH MINT ---
    console.log("\n--- Step 2: Admin calls batchMint ---");
    
    const recipients = [user1.address, user2.address];
    const amounts = [
        ethers.utils.parseUnits("150", 6), // 150 tGHSX for user 1
        ethers.utils.parseUnits("250", 6)  // 250 tGHSX for user 2
    ];

    console.log(`   - Minting ${ethers.utils.formatUnits(amounts[0], 6)} tGHSX for User 1`);
    console.log(`   - Minting ${ethers.utils.formatUnits(amounts[1], 6)} tGHSX for User 2`);

    const batchMintTx = await tghsxToken.connect(admin).batchMint(recipients, amounts);
    await batchMintTx.wait();
    console.log("✅ batchMint transaction successful!");

    // --- 4. VERIFY OUTCOME ---
    console.log("\n--- Step 3: Verify balances of recipients ---");
    const balance1 = await tghsxToken.balanceOf(user1.address);
    const balance2 = await tghsxToken.balanceOf(user2.address);

    console.log(`   - User 1 Final Balance: ${ethers.utils.formatUnits(balance1, 6)} tGHSX`);
    console.log(`   - User 2 Final Balance: ${ethers.utils.formatUnits(balance2, 6)} tGHSX`);
    
    if (balance1.eq(amounts[0]) && balance2.eq(amounts[1])) {
        console.log("\n🎉 SUCCESS: Both recipients received the correct amount of tokens.");
    } else {
        console.error("\n❌ FAILED: One or more recipients have an incorrect balance.");
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Batch Mint test failed:", error);
        process.exit(1);
    });
