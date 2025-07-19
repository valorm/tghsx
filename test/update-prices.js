
const { ethers } = require("hardhat");

async function main() {
    // Load addresses dynamically from the deployment artifact
    const deployment = require("../deployments/deployment.json");
    const VAULT_ADDRESS = deployment.contracts.CollateralVault;
    const COLLATERAL_ADDRESSES = deployment.contracts.MockTokens;

    // --- DEFINE NEW PRICES HERE (in GHS) ---
    //comment out any lines for assets you don't want to update.
    const NEW_PRICES = {
        WETH: "27000.00",
        WMATIC: "0.85",
        USDC: "1.01",
        WBTC: "960000.00"
    };
    // -----------------------------------------

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
    console.log("\n--- Step 2: Updating prices ---");
    for (const [symbol, newPriceStr] of Object.entries(NEW_PRICES)) {
        const tokenAddress = COLLATERAL_ADDRESSES[symbol];
        if (!tokenAddress) {
            console.log(`   - Skipping ${symbol}: Address not found.`);
            continue;
        }

        // Price must be formatted with 6 decimals for the vault's internal precision
        const priceForVault = ethers.utils.parseUnits(newPriceStr, 6);

        console.log(`   - Updating ${symbol} price to ${newPriceStr} GHS...`);
        try {
            const updateTx = await collateralVault.connect(admin).updatePrice(tokenAddress, priceForVault);
            await updateTx.wait();
            console.log(`   ✅ Successfully updated price for ${symbol}.`);

        } catch (error) {
            console.error(`   ❌ Failed to update price for ${symbol}:`, error.message);
        }
    }
    
    console.log("\n--- Step 3: Verifying final prices on-chain ---");
    for (const [symbol, tokenAddress] of Object.entries(COLLATERAL_ADDRESSES)) {
        const config = await collateralVault.collateralConfigs(tokenAddress);
        if (config.enabled) {
            console.log(`   - Final ${symbol} Price: ${ethers.utils.formatUnits(config.price, 6)} GHS`);
        }
    }

    console.log("\n🎉 All price feeds have been updated.");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Price update script failed:", error);
        process.exit(1);
    });
