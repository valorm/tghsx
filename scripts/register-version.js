
const { ethers, network } = require("hardhat");
const fs = require("fs");

async function main() {
    console.log("📝 Registering latest contract versions in the VersionRegistry...");

    const [deployer] = await ethers.getSigners();
   
    const networkName = network.name;

    console.log(`   - Operating on network: ${networkName}`);
    console.log(`   - Using admin account: ${deployer.address}`);

    // --- 1. Load Deployment Addresses ---
    let registryDeployment, protocolDeployment;
    try {
        registryDeployment = require(`../deployments/registry-deployment-${networkName}.json`);
        protocolDeployment = require(`../deployments/protocol-deployment-${networkName}.json`);
    } catch (error) {
        console.error(`❌ Error: Could not find deployment files for the '${networkName}' network. Please ensure both 'registry-deployment-${networkName}.json' and 'protocol-deployment-${networkName}.json' exist.`);
        return;
    }

    const REGISTRY_ADDRESS = registryDeployment.contracts.VersionRegistry;
    const componentsToRegister = [
        {
            name: "CollateralVault",
            address: protocolDeployment.contracts.CollateralVault,
            notes: "Initial v1.2 deployment with all bug fixes."
        },
        {
            name: "TGHSXToken",
            address: protocolDeployment.contracts.TGHSXToken,
            notes: "Initial v1.2 deployment with all bug fixes."
        }
    ];

    const registry = await ethers.getContractAt("VersionRegistry", REGISTRY_ADDRESS);

    // --- 2. Register Each Component ---
    console.log("\n--- Checking and registering components ---");

    for (const component of componentsToRegister) {
        console.log(`\nProcessing component: ${component.name}`);
        let needsUpdate = false;
        
        try {
            const latestAddress = await registry.getLatestAddress(component.name);
            if (latestAddress.toLowerCase() !== component.address.toLowerCase()) {
                console.log(`   - Found old address: ${latestAddress}`);
                console.log(`   - New address:     ${component.address}`);
                needsUpdate = true;
            } else {
                console.log(`   - Address ${latestAddress} is already up-to-date.`);
            }
        } catch (error) {
            // If getLatestAddress fails, it means the component has never been registered.
            if (error.message.includes("Component not found")) {
                console.log("   - Component not yet registered. Registering for the first time.");
                needsUpdate = true;
            } else {
                console.error(`   - An unexpected error occurred: ${error.message}`);
                continue; // Skip to the next component
            }
        }

        if (needsUpdate) {
            try {
                const tx = await registry.setVersion(component.name, component.address, component.notes);
                await tx.wait();
                console.log(`   ✅ Successfully registered new version for ${component.name}.`);
            } catch (error) {
                console.error(`   ❌ Failed to register new version for ${component.name}:`, error.message);
            }
        }
    }

    // --- 3. Verify Final State ---
    console.log("\n--- Verifying final registered versions ---");
    for (const component of componentsToRegister) {
        try {
            const latestVersion = await registry.getLatestVersion(component.name);
            console.log(`   - Latest ${component.name}:`);
            console.log(`     - Version: ${latestVersion.version.toString()}`);
            console.log(`     - Address: ${latestVersion.contractAddress}`);
            console.log(`     - Date:    ${new Date(latestVersion.deploymentDate * 1000).toLocaleString()}`);
        } catch (error) {
            console.error(`   - Could not retrieve version for ${component.name}.`);
        }
    }

    console.log("\n🎉 Version registration process complete.");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Script failed:", error);
        process.exit(1);
    });
