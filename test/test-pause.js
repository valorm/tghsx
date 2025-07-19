
const { ethers } = require("hardhat");

async function main() {
    // Load addresses dynamically from the deployment artifact
    const deployment = require("../deployments/deployment.json");
    const VAULT_ADDRESS = deployment.contracts.CollateralVault;
    const TOKEN_ADDRESS = deployment.contracts.TGHSXToken;
    const WMATIC_ADDRESS = deployment.contracts.MockTokens.WMATIC;

    console.log("🛡️  Testing Emergency Pause functionality...");

    const [account] = await ethers.getSigners();
    const anotherAccount = (await ethers.getSigners())[1]; // Use the second default Hardhat account
    console.log(`   - Using account with EMERGENCY_ROLE: ${account.address}`);

    const collateralVault = await ethers.getContractAt("CollateralVault", VAULT_ADDRESS);
    const tghsxToken = await ethers.getContractAt("TGHSXToken", TOKEN_ADDRESS);

    // --- Part 1: Test CollateralVault Pause ---
    console.log("\n--- Testing CollateralVault Pause ---");

    // 1. PAUSE THE VAULT
    console.log("\n1. Calling emergencyPause() on the Vault...");
    const pauseTx = await collateralVault.emergencyPause();
    await pauseTx.wait();
    let isPaused = await collateralVault.paused();
    console.log(`✅ Vault paused successfully. Current state: ${isPaused}`);

    // 2. ATTEMPT A DEPOSIT (SHOULD FAIL)
    console.log("\n2. Attempting to deposit collateral while Vault is paused (should fail)...");
    try {
        const wmaticToken = await ethers.getContractAt("MockERC20", WMATIC_ADDRESS);
        await wmaticToken.approve(VAULT_ADDRESS, ethers.utils.parseUnits("1", 18));
        await collateralVault.depositCollateral(WMATIC_ADDRESS, ethers.utils.parseUnits("1", 18));
        console.error("❌ TEST FAILED: Deposit succeeded while paused.");
    } catch (error) {
        if (error.message.includes("reverted with custom error 'EnforcedPause()'")) {
            console.log("✅ SUCCESS: Transaction correctly reverted with 'EnforcedPause()' error.");
        } else {
            console.error("❌ TEST FAILED: Transaction failed, but with an unexpected error:", error.message);
        }
    }

    // 3. UNPAUSE THE VAULT
    console.log("\n3. Calling emergencyUnpause() on the Vault...");
    const unpauseTx = await collateralVault.emergencyUnpause();
    await unpauseTx.wait();
    isPaused = await collateralVault.paused();
    console.log(`✅ Vault unpaused successfully. Current state: ${isPaused}`);


    // --- Part 2: Test TGHSXToken Emergency Stop ---
    console.log("\n\n--- Testing TGHSXToken Emergency Stop ---");

    // 1. ENABLE EMERGENCY STOP ON TOKEN
    console.log("\n1. Calling toggleEmergencyStop(true) on the Token...");
    const stopTx = await tghsxToken.toggleEmergencyStop(true);
    await stopTx.wait();
    let isStopped = await tghsxToken.emergencyStop();
    console.log(`✅ Token emergency stop enabled. Current state: ${isStopped}`);

    // 2. ATTEMPT A TRANSFER (SHOULD FAIL)
    console.log("\n2. Attempting to transfer tGHSX while emergency stop is active (should fail)...");
    try {
        // Mint some tokens to the admin account first to ensure it has a balance to transfer
        const MINTER_BURNER_ROLE = await tghsxToken.MINTER_BURNER_ROLE();
        await tghsxToken.grantRole(MINTER_BURNER_ROLE, account.address);
        await tghsxToken.mint(account.address, ethers.utils.parseUnits("100", 6));

        await tghsxToken.transfer(anotherAccount.address, ethers.utils.parseUnits("1", 6));
        console.error("❌ TEST FAILED: Transfer succeeded while stopped.");
    } catch (error) {
        if (error.message.includes("reverted with custom error 'EmergencyStopActive()'")) {
             console.log("✅ SUCCESS: Transaction correctly reverted with 'EmergencyStopActive()' error.");
        } else {
            console.error("❌ TEST FAILED: Transaction failed, but with an unexpected error:", error.message);
        }
    }

    // 3. DISABLE EMERGENCY STOP ON TOKEN
    console.log("\n3. Calling toggleEmergencyStop(false) on the Token...");
    const startTx = await tghsxToken.toggleEmergencyStop(false);
    await startTx.wait();
    isStopped = await tghsxToken.emergencyStop();
    console.log(`✅ Token emergency stop disabled. Current state: ${isStopped}`);
    
    console.log("\n4. Attempting to transfer tGHSX again (should succeed)...");
    const transferTx = await tghsxToken.transfer(anotherAccount.address, ethers.utils.parseUnits("1", 6));
    await transferTx.wait();
    console.log("✅ SUCCESS: Transfer was successful after disabling the emergency stop.");


    console.log("\n\n🎉 Emergency pause tests complete!");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Script failed:", error);
        process.exit(1);
    });
