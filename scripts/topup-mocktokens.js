const { ethers } = require("hardhat");

async function main() {
  console.log("🚀 Starting token top-up...");

  const deployment = require("../deployments/deployment.json");

  const recipient = "#";
  const [admin] = await ethers.getSigners();

  console.log(`🔐 Admin: ${admin.address}`);
  console.log(`🎯 Target: ${recipient}`);

  const rawTokens = [
    {
      name: "WMATIC",
      address: deployment.contracts.MockTokens.WMATIC,
      decimals: 18,
      amount: "1000"
    },
    {
      name: "WETH",
      address: deployment.contracts.MockTokens.WETH,
      decimals: 18,
      amount: "1000"
    },
    {
      name: "USDC",
      address: deployment.contracts.MockTokens.USDC,
      decimals: 6,
      amount: "1000"
    },
    {
      name: "WBTC",
      address: deployment.contracts.MockTokens.WBTC,
      decimals: 8,
      amount: "1"
    }
  ];

  for (const token of rawTokens) {
    try {
      const checksummedAddress = ethers.utils.getAddress(token.address);
      const contract = await ethers.getContractAt("MockERC20", checksummedAddress);
      const amountParsed = ethers.utils.parseUnits(token.amount, token.decimals);
      const tx = await contract.connect(admin).transfer(recipient, amountParsed);
      await tx.wait();
      console.log(`✅ Sent ${token.amount} ${token.name} to ${recipient}`);
    } catch (err) {
      console.error(`❌ Failed to send ${token.name}:`, err.message);
    }
  }
}

main().catch((err) => {
  console.error("❌ Script failed:", err);
  process.exit(1);
});
