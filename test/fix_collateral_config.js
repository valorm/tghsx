// fix_collateral_config.js - FIXED VERSION
const { ethers } = require("hardhat");

async function main() {
    // Load addresses dynamically from the deployment artifact
    const deployment = require("../deployments/deployment.json");
    const VAULT_ADDRESS = deployment.contracts.CollateralVault;
    const USDC_ADDRESS = deployment.contracts.MockTokens.USDC;

    console.log("🔧 Fixing USDC Collateral Configuration...");

    // --- 1. SETUP ---
    const [account] = await ethers.getSigners();
    console.log(`   - Using account: ${account.address}`);

    const collateralVault = await ethers.getContractAt("CollateralVault", VAULT_ADDRESS);

    // --- 2. CHECK CURRENT CONFIG ---
    console.log("\n--- Current USDC Configuration ---");
    try {
        const config = await collateralVault.collateralConfigs(USDC_ADDRESS);
        console.log("Raw config:", config);
        
        // Access the correct field names based on your contract structure
        console.log(`   - Price: ${config.price ? ethers.utils.formatUnits(config.price, 6) : 'undefined'} GHS per USDC`);
        console.log(`   - Max LTV: ${config.maxLTV !== undefined ? config.maxLTV / 100 : 'undefined'}%`);
        console.log(`   - Liquidation Bonus: ${config.liquidationBonus !== undefined ? config.liquidationBonus / 100 : 'undefined'}%`);
        console.log(`   - Is Enabled: ${config.enabled !== undefined ? config.enabled : 'undefined'}`);
        console.log(`   - Decimals: ${config.decimals !== undefined ? config.decimals : 'undefined'}`);
        console.log(`   - Last Price Update: ${config.lastPriceUpdate ? new Date(config.lastPriceUpdate.toNumber() * 1000) : 'undefined'}`);
    } catch (error) {
        console.log("❌ Failed to read config:", error.message);
    }

    // --- 3. UPDATE CONFIG IF NEEDED ---
    console.log("\n--- Checking if configuration needs updating ---");
    
    try {
        const config = await collateralVault.collateralConfigs(USDC_ADDRESS);
        
        // Check if maxLTV is reasonable (should be > 0 and < 10000 for percentage in basis points)
        if (!config.maxLTV || config.maxLTV === 0) {
            console.log("❌ maxLTV is missing or zero. Need to update configuration.");
            
            // Try to find the correct function to update the config
            // You'll need to check your contract's ABI for the exact function name
            console.log("   - Please check your CollateralVault contract for the correct function to update maxLTV");
            console.log("   - Common function names might be:");
            console.log("     * updateCollateralConfig(address, uint256, uint256, uint256)");
            console.log("     * setMaxLTV(address, uint256)");
            console.log("     * configureCollateral(address, ...)");
            
        } else {
            console.log(`✅ maxLTV is configured: ${config.maxLTV / 100}%`);
        }
        
        if (!config.enabled) {
            console.log("❌ Collateral is not enabled");
        } else {
            console.log("✅ Collateral is enabled");
        }
        
    } catch (error) {
        console.log("❌ Failed to check config:", error.message);
    }

    console.log("\n🔧 Configuration check complete!");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Fix failed:", error);
        process.exit(1);
    });

