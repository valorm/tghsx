
const { ethers } = require("hardhat");

// Load the latest deployment addresses
const deployment = require("../deployments/deployment.json");
const VAULT_ADDRESS = deployment.contracts.CollateralVault;
const COLLATERAL_ADDRESSES = deployment.contracts.MockTokens;

async function main() {
    console.log("🔄 Refreshing all price feed timestamps in the CollateralVault...");

    const [admin] = await ethers.getSigners();
    console.log(`   - Using admin account: ${admin.address}`);

    const collateralVault = await ethers.getContractAt("CollateralVault", VAULT_ADDRESS);

    // --- 1. Ensure Admin has ORACLE_ROLE ---
    console.log("\n--- Step 1: Verifying permissions ---");
    const ORACLE_ROLE = await collateralVault.ORACLE_ROLE();
    if (!(await collateralVault.hasRole(ORACLE_ROLE, admin.address))) {
        console.log("   - Admin does not have ORACLE_ROLE. Granting role...");
        const grantRoleTx = await collateralVault.grantRole(ORACLE_ROLE, admin.address);
        await grantRoleTx.wait();
        console.log("   ✅ ORACLE_ROLE granted successfully.");
    } else {
        console.log("   ✅ Admin already has the ORACLE_ROLE.");
    }

    // --- 2. Iterate and Refresh Each Price ---
    console.log("\n--- Step 2: Refreshing prices ---");
    for (const [symbol, address] of Object.entries(COLLATERAL_ADDRESSES)) {
        try {
            // Get the current price from the contract
            const currentConfig = await collateralVault.collateralConfigs(address);
            if (!currentConfig.enabled) {
                console.log(`   - Skipping ${symbol} (not an enabled collateral).`);
                continue;
            }
            const currentPrice = currentConfig.price;

            // Call updatePrice with the same price to refresh the timestamp
            const updateTx = await collateralVault.connect(admin).updatePrice(address, currentPrice);
            await updateTx.wait();
            console.log(`   ✅ Successfully refreshed price for ${symbol}.`);

        } catch (error) {
            console.error(`   ❌ Failed to refresh price for ${symbol}:`, error.message);
        }
    }
    
    console.log("\n🎉 All price feeds have been refreshed.");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Price refresh script failed:", error);
        process.exit(1);
    });
