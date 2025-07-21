const { ethers } = require("hardhat");

async function main() {
    const deployment = require("../deployments/deployment.json");
    const WMATIC_ADDRESS = deployment.contracts.MockTokens.WMATIC;

    const [admin] = await ethers.getSigners();

    const wmatic = await ethers.getContractAt("MockERC20", WMATIC_ADDRESS);
    const recipient = "#";
    const amount = ethers.utils.parseUnits("1000", 18); // 1000 WMATIC

    console.log(`Sending 1000 WMATIC to ${recipient}...`);
    const tx = await wmatic.connect(admin).transfer(recipient, amount);
    await tx.wait();
    console.log(`✅ Transfer successful. Tx Hash: ${tx.hash}`);
}

main().catch((error) => {
    console.error("❌ Top-up failed:", error);
    process.exit(1);
});
