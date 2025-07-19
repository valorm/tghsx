
const { ethers, network } = require("hardhat");
const fs = require("fs");

async function main() {
    // --- 1. Get Component Name from Command Line Arguments ---
    const componentName = process.argv[2];
    if (!componentName) {
        console.error("❌ Error: Please provide the component name as an argument.");
        console.log("   Example: npx hardhat run scripts/get-latest-address.js CollateralVault");
        process.exit(1);
    }

    console.log(`🔎 Fetching latest address for component: "${componentName}"...`);

    const networkName = network.name;
    console.log(`   - Operating on network: ${networkName}`);

    // --- 2. Load Registry Address ---
    let registryDeployment;
    try {
        registryDeployment = require(`../deployments/registry-deployment-${networkName}.json`);
    } catch (error) {
        console.error(`❌ Error: Could not find 'registry-deployment-${networkName}.json'. Please deploy the registry first.`);
        return;
    }

    const REGISTRY_ADDRESS = registryDeployment.contracts.VersionRegistry;
    const registry = await ethers.getContractAt("VersionRegistry", REGISTRY_ADDRESS);

    // --- 3. Fetch and Display the Address ---
    try {
        const latestAddress = await registry.getLatestAddress(componentName);
        const latestVersion = await registry.getLatestVersion(componentName);

        console.log("\n✅ Found latest version:");
        console.log("=============================================================");
        console.log(`   Component:      ${componentName}`);
        console.log(`   Version:        ${latestVersion.version.toString()}`);
        console.log(`   Address:        ${latestAddress}`);
        console.log(`   Deployment Date: ${new Date(latestVersion.deploymentDate * 1000).toLocaleString()}`);
        console.log(`   Notes:          "${latestVersion.notes}"`);
        console.log("=============================================================");

    } catch (error) {
        if (error.message.includes("Component not found")) {
            console.error(`\n❌ Error: Component "${componentName}" not found in the registry on the ${networkName} network.`);
        } else {
            console.error("\n❌ An unexpected error occurred:", error.message);
        }
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Script failed:", error);
        process.exit(1);
    });
