
const { ethers } = require("hardhat");

// --- Configuration ---
// Load addresses dynamically from the deployment artifact
const deployment = require("../deployments/deployment.json");
const VAULT_ADDRESS = deployment.contracts.CollateralVault;

// The address that will RECEIVE the new roles.
const newAdminAddress = "address";
// ---------------------

async function main() {
    console.log("🔐 Granting roles for the CollateralVault...");

    const [deployer] = await ethers.getSigners();
    console.log(`   - Using admin account: ${deployer.address}`);
    console.log(`   - Granting roles to:   ${newAdminAddress}`);

    const collateralVault = await ethers.getContractAt("CollateralVault", VAULT_ADDRESS);

    // --- 1. Grant VAULT_ADMIN_ROLE ---
    console.log("\n1. Granting VAULT_ADMIN_ROLE...");
    const VAULT_ADMIN_ROLE = await collateralVault.VAULT_ADMIN_ROLE();
    
    // Check if the role is already granted
    if (await collateralVault.hasRole(VAULT_ADMIN_ROLE, newAdminAddress)) {
        console.log("   ✅ Address already has the VAULT_ADMIN_ROLE.");
    } else {
        const grantAdminTx = await collateralVault.grantRole(VAULT_ADMIN_ROLE, newAdminAddress);
        await grantAdminTx.wait();
        console.log("   ✅ VAULT_ADMIN_ROLE granted successfully.");
    }

    // --- 2. Grant ORACLE_ROLE ---
    console.log("\n2. Granting ORACLE_ROLE...");
    const ORACLE_ROLE = await collateralVault.ORACLE_ROLE();

    // Check if the role is already granted
    if (await collateralVault.hasRole(ORACLE_ROLE, newAdminAddress)) {
        console.log("   ✅ Address already has the ORACLE_ROLE.");
    } else {
        const grantOracleTx = await collateralVault.grantRole(ORACLE_ROLE, newAdminAddress);
        await grantOracleTx.wait();
        console.log("   ✅ ORACLE_ROLE granted successfully.");
    }
    
    // --- 3. Verify Roles ---
    console.log("\n3. Verifying final roles...");
    const hasAdminRole = await collateralVault.hasRole(VAULT_ADMIN_ROLE, newAdminAddress);
    const hasOracleRole = await collateralVault.hasRole(ORACLE_ROLE, newAdminAddress);
    console.log(`   - Has VAULT_ADMIN_ROLE? ${hasAdminRole}`);
    console.log(`   - Has ORACLE_ROLE?      ${hasOracleRole}`);

    console.log("\n🎉 Role management script complete.");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Script failed:", error);
        process.exit(1);
    });
