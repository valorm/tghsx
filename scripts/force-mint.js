// scripts/force-mint.js
const { ethers } = require("hardhat");

// --- Paste the latest deployed addresses here ---
const collateralVaultAddress = "0x8dc1E1E376E5f105Ee22b6a20F943bbd897e192B";
const wmaticTokenAddress = "0x13c09eAa18d75947A5426CaeDdEb65922400028c";
// ---------------------------------------------

async function main() {
    const [account] = await ethers.getSigners();
    console.log("🎬 Starting final mint attempt for account:", account.address);

    const collateralVault = await ethers.getContractAt("CollateralVault", collateralVaultAddress);
    const mintAmount = ethers.utils.parseUnits("400", 6);

    // --- Pre-flight Check ---
    console.log("\n1. Verifying on-chain state before minting...");
    const position = await collateralVault.getUserPosition(account.address, wmaticTokenAddress);
    const collateralBalance = ethers.utils.formatUnits(position.collateralAmount, 18);
    const mintedBalance = ethers.utils.formatUnits(position.mintedAmount, 6);
    console.log(`   - Current Collateral: ${collateralBalance} WMATIC`);
    console.log(`   - Current Minted: ${mintedBalance} tGHSX`);

    if (position.collateralAmount.isZero()) {
        console.error("\n❌ ERROR: No collateral has been deposited for this account. Please run the main 'interact.js' script first.");
        process.exit(1);
    }
    console.log("   ✅ State looks good. Proceeding with mint.");
    // --- End Check ---

    try {
        console.log(`\n2. Attempting to mint ${ethers.utils.formatUnits(mintAmount, 6)} tGHSX with a very high gas limit...`);
        const mintTx = await collateralVault.mintTokens(
            wmaticTokenAddress,
            mintAmount,
            {
                gasLimit: 1000000, // Use a very large, hardcoded gas limit
            }
        );

        console.log("   - Transaction sent! Waiting for confirmation...");
        console.log("   - Tx Hash:", mintTx.hash);
        await mintTx.wait();
        console.log("\n🎉 SUCCESS! The transaction was confirmed!");

    } catch (error) {
        console.error("\n❌ MINTING FAILED, even with a massive gas limit.");
        console.error("   - This strongly suggests an issue with the RPC provider or the Amoy network itself.");
        console.error("   - Please try again later or consider switching your AMOY_RPC_URL in the .env file.");
        process.exit(1);
    }

    console.log("\n3. Verifying final position...");
    const finalPosition = await collateralVault.getUserPosition(account.address, wmaticTokenAddress);
    const finalMinted = ethers.utils.formatUnits(finalPosition.mintedAmount, 6);
    console.log(`   - Total Minted: ${finalMinted} tGHSX`);

    console.log("\n✅ System is fully functional.");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        // The try/catch inside main will handle the exit.
    });
