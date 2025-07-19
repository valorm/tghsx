// scripts/deploy-registry.js
const { ethers, run } = require("hardhat");
const fs = require("fs");

async function verify(address, args) {
    console.log(`\nVerifying contract at ${address}...`);
    try {
        await run("verify:verify", {
            address: address,
            constructorArguments: args,
        });
        console.log("✅ Successfully verified!");
    } catch (e) {
        if (e.message.toLowerCase().includes("already verified")) {
            console.log("✅ Already verified!");
        } else {
            console.error("❌ Verification failed:", e.message);
        }
    }
}

async function main() {
    const deploymentTimestamp = new Date().toLocaleString("en-GH", { timeZone: "Africa/Accra" });
    console.log(`🚀 Deploying VersionRegistry at ${deploymentTimestamp} (GMT)...`);

    const [deployer] = await ethers.getSigners();
    const network = await ethers.provider.getNetwork();
    const networkName = network.name === "unknown" ? "localhost" : network.name;

    console.log(`   - Deploying on network: ${networkName} (Chain ID: ${network.chainId})`);
    console.log(`   - Using account: ${deployer.address}`);

    const VersionRegistry = await ethers.getContractFactory("VersionRegistry");

    console.log("\n1. Deploying contract...");
    const registry = await VersionRegistry.deploy();
    await registry.deployed();
    
    console.log("✅ Contract deployed successfully!");
    console.log("   - Address:", registry.address);

    // Automatically verify on public testnets
    if (networkName !== "hardhat" && networkName !== "localhost" && process.env.POLYGONSCAN_API_KEY) {
        console.log("\n2. Waiting for block confirmations before verification...");
        await registry.deployTransaction.wait(5); 
        await verify(registry.address, []);
    }

    // --- Improvement: Save deployment info ---
    console.log("\n3. Saving deployment information...");
    const deploymentInfo = {
        network: networkName,
        timestamp: deploymentTimestamp,
        deployer: deployer.address,
        contracts: {
            VersionRegistry: registry.address
        }
    };

    const deploymentsDir = "./deployments";
    if (!fs.existsSync(deploymentsDir)) {
        fs.mkdirSync(deploymentsDir);
    }
    
    const filePath = `${deploymentsDir}/registry-deployment-${networkName}.json`;
    fs.writeFileSync(filePath, JSON.stringify(deploymentInfo, null, 2));
    console.log(`   ✅ Deployment info saved to: ${filePath}`);
    // --- End Improvement ---

    console.log("\n🎉 Deployment of VersionRegistry complete.");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Deployment failed:", error);
        process.exit(1);
    });
