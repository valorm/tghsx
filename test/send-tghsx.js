
const { ethers } = require("hardhat");

// --- Configuration ---
const TOKEN_ADDRESS = "0xb04093d34F5feC6DE685B8684F3e2086dd866a50";
const RECIPIENT_ADDRESS = "0x37c6aa9328c616cd339dba0b3bb75ccad19c31c5";
const AMOUNT_TO_SEND = "50"; // Amount of tGHSX to send
// ---------------------

async function main() {
    console.log(`💸 Preparing to send tGHSX...`);

    const [sender] = await ethers.getSigners();
    console.log(`   - Sender:    ${sender.address}`);
    console.log(`   - Recipient: ${RECIPIENT_ADDRESS}`);
    console.log(`   - Amount:    ${AMOUNT_TO_SEND} tGHSX`);

    const tghsxToken = await ethers.getContractAt("TGHSXToken", TOKEN_ADDRESS);

    // --- 1. Ensure Sender has tokens ---
    console.log("\n--- Step 1: Minting test tokens to sender ---");
    const MINTER_BURNER_ROLE = await tghsxToken.MINTER_BURNER_ROLE();

    // Grant the role if the sender doesn't have it
    if (!(await tghsxToken.hasRole(MINTER_BURNER_ROLE, sender.address))) {
        console.log("   - Sender does not have MINTER_BURNER_ROLE. Granting role...");
        const grantRoleTx = await tghsxToken.grantRole(MINTER_BURNER_ROLE, sender.address);
        await grantRoleTx.wait();
        console.log("   ✅ MINTER_BURNER_ROLE granted.");
    }

    const amountToMint = ethers.utils.parseUnits("1000", 6); // Mint 1,000 tGHSX
    await tghsxToken.mint(sender.address, amountToMint);
    console.log(`✅ Minted 1,000 tGHSX to the sender.`);

    const senderBalanceBefore = await tghsxToken.balanceOf(sender.address);
    const recipientBalanceBefore = await tghsxToken.balanceOf(RECIPIENT_ADDRESS);
    console.log(`   - Sender balance before:    ${ethers.utils.formatUnits(senderBalanceBefore, 6)} tGHSX`);
    console.log(`   - Recipient balance before: ${ethers.utils.formatUnits(recipientBalanceBefore, 6)} tGHSX`);

    // --- 2. Execute Transfer ---
    console.log("\n--- Step 2: Executing the transfer ---");
    const amountToSendWei = ethers.utils.parseUnits(AMOUNT_TO_SEND, 6);
    const transferTx = await tghsxToken.transfer(RECIPIENT_ADDRESS, amountToSendWei);
    await transferTx.wait();
    console.log("✅ Transfer successful!");
    console.log("   - Tx Hash:", transferTx.hash);

    // --- 3. Verify Final Balances ---
    console.log("\n--- Step 3: Verifying final balances ---");
    const senderBalanceAfter = await tghsxToken.balanceOf(sender.address);
    const recipientBalanceAfter = await tghsxToken.balanceOf(RECIPIENT_ADDRESS);

    console.log(`   - Sender balance after:    ${ethers.utils.formatUnits(senderBalanceAfter, 6)} tGHSX`);
    console.log(`   - Recipient balance after: ${ethers.utils.formatUnits(recipientBalanceAfter, 6)} tGHSX`);

    if (recipientBalanceAfter.sub(recipientBalanceBefore).eq(amountToSendWei)) {
        console.log("\n🎉 SUCCESS: Recipient's balance increased by the correct amount.");
    } else {
        console.error("\n❌ FAILED: Recipient's balance did not update correctly.");
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Script failed:", error);
        process.exit(1);
    });
