// scripts/debug-mint.js
const { ethers } = require("hardhat");

// --- Paste the latest deployed addresses here ---
const collateralVaultAddress = "0x8dc1E1E376E5f105Ee22b6a20F943bbd897e192B";
const wmaticTokenAddress = "0x13c09eAa18d75947A5426CaeDdEb65922400028c";
// ---------------------------------------------

async function main() {
    const [account] = await ethers.getSigners();
    console.log("🕵️‍♂️  Starting debug session for mintTokens function...");
    console.log("   - Account:", account.address);
    console.log("   - Vault:", collateralVaultAddress);

    const collateralVault = await ethers.getContractAt("CollateralVault", collateralVaultAddress);
    const mintAmount = ethers.utils.parseUnits("400", 6); // 400 tGHSX

    try {
        // Use callStatic to simulate the transaction and get the revert reason
        console.log("\n1. Simulating mintTokens call to find the revert reason...");
        await collateralVault.callStatic.mintTokens(wmaticTokenAddress, mintAmount, { from: account.address });

        // If callStatic succeeds, it means the transaction *should* work.
        console.log("\n✅ Simulation successful! The transaction should not fail.");
        console.log("   - This indicates the problem might be related to gas or network state.");

    } catch (error) {
        console.error("\n❌ Simulation failed! Found the revert reason.");

        // Hardhat/Ethers wraps the revert reason in a complex object. We need to parse it.
        if (error.reason) {
            console.error(`   ➡️  Revert Reason: "${error.reason}"`);
        } else if (error.data) {
            try {
                const decodedError = collateralVault.interface.parseError(error.data);
                console.error(`   ➡️  Decoded Revert Reason: ${decodedError.name}`);
                if (decodedError.args && decodedError.args.length > 0) {
                    console.error("   ➡️  Arguments:", decodedError.args);
                }
            } catch (e) {
                console.error("   Could not decode the revert reason from error data.");
                console.error("   Raw Error:", error);
            }
        } else {
            console.error("   Could not find a revert reason in the error object.");
            console.error(error);
        }
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Debug script failed:", error);
        process.exit(1);
    });
