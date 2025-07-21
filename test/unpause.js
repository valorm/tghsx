// unpause.js - Unpauses Vault and Token in emergency mode
const { ethers } = require("hardhat");

async function main() {
    const deployment = require("../deployments/deployment.json");

    const VAULT_ADDRESS = deployment.contracts.CollateralVault;
    const TOKEN_ADDRESS = deployment.contracts.TGHSXToken;

    console.log("🟢 Starting emergency unpause sequence...");

    const [account] = await ethers.getSigners();
    console.log(`   - Using admin account: ${account.address}`);

    const collateralVault = await ethers.getContractAt("CollateralVault", VAULT_ADDRESS);
    const tghsxToken = await ethers.getContractAt("TGHSXToken", TOKEN_ADDRESS);

    // --- Unpause CollateralVault ---
    try {
        const isPaused = await collateralVault.paused();
        if (isPaused) {
            console.log("🔧 Vault is currently paused. Calling emergencyUnpause()...");
            const tx = await collateralVault.emergencyUnpause();
            await tx.wait();
            console.log("✅ Vault successfully unpaused.");
        } else {
            console.log("✅ Vault is already unpaused.");
        }
    } catch (e) {
        console.error("❌ Failed to unpause Vault:", e.message);
    }

    // --- Disable Emergency Stop on TGHSXToken ---
    try {
        const isStopped = await tghsxToken.emergencyStop();
        if (isStopped) {
            console.log("🔧 Token is in emergency stop. Calling toggleEmergencyStop(false)...");
            const tx = await tghsxToken.toggleEmergencyStop(false);
            await tx.wait();
            console.log("✅ Emergency stop disabled on token.");
        } else {
            console.log("✅ Token is already active (not stopped).");
        }
    } catch (e) {
        console.error("❌ Failed to disable emergency stop on token:", e.message);
    }

    console.log("\n🎉 Unpause complete.");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Script failed:", error);
        process.exit(1);
    });
