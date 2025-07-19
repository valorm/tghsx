
const { ethers } = require("hardhat");

async function main() {
    // Load addresses dynamically from the deployment artifact
    const deployment = require("../deployments/deployment.json");
    const VAULT_ADDRESS = deployment.contracts.CollateralVault;
    const TOKEN_ADDRESS = deployment.contracts.TGHSXToken;

    console.log("⚙️  Enabling Auto-Mint functionality on all contracts...");

    // --- 1. SETUP ---
    const [admin] = await ethers.getSigners();
    console.log(`   - Using admin account: ${admin.address}`);

    const collateralVault = await ethers.getContractAt("CollateralVault", VAULT_ADDRESS);
    const tghsxToken = await ethers.getContractAt("TGHSXToken", TOKEN_ADDRESS);

    // --- 2. ENABLE AUTOMINT ON COLLATERALVAULT ---
    console.log("\n--- Enabling on CollateralVault ---");
    if (!(await collateralVault.autoMintEnabled())) {
        console.log("   - Status: DISABLED. Enabling now...");
        const enableVaultTx = await collateralVault.connect(admin).toggleAutoMint(true);
        await enableVaultTx.wait();
        console.log("   ✅ Auto-mint on Vault has been enabled.");
    } else {
        console.log("   ✅ Auto-mint on Vault is already enabled.");
    }
    const vaultStatus = await collateralVault.autoMintEnabled();
    console.log(`   - Final Vault Status: ${vaultStatus}`);


    // --- 3. ENABLE AUTOMINT ON TGHSXTOKEN ---
    console.log("\n--- Enabling on TGHSXToken ---");
    if (!(await tghsxToken.autoMintEnabled())) {
        console.log("   - Status: DISABLED. Enabling now...");
        const enableTokenTx = await tghsxToken.connect(admin).toggleAutoMint(true);
        await enableTokenTx.wait();
        console.log("   ✅ Auto-mint on Token has been enabled.");
    } else {
        console.log("   ✅ Auto-mint on Token is already enabled.");
    }
    const tokenStatus = await tghsxToken.autoMintEnabled();
    console.log(`   - Final Token Status: ${tokenStatus}`);


    console.log("\n🎉 Auto-minting is now active on the protocol.");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Script failed:", error);
        process.exit(1);
    });
