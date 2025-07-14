// scripts/verify-all.js
const { run, ethers } = require("hardhat");

const addresses = {
  TGHSXToken:      "0x7aD3121876c4F8104F3703efe3034CE632974943",
  CollateralVault: "0x8dc1E1E376E5f105Ee22b6a20F943bbd897e192B",
  MockUSDC:        "0xAC2f1680f2705d3Dd314534Bf24b424ccBC8D8f5",
  MockWETH:        "0xF5FcbF9D665DC89b2d18f87a6994F04849dC80E5",
  MockWBTC:        "0x6F74072d5AF1132B13c5a7226E41aAC1f8DBBdae",
  MockWMATIC:      "0x13c09eAa18d75947A5426CaeDdEb65922400028c",
};

const constructorArgs = {
  TGHSXToken:      [],
  CollateralVault: [addresses.TGHSXToken],
  MockUSDC:        ["Mock USDC","USDC",6, ethers.utils.parseUnits("1000000",6)],
  MockWETH:        ["Mock WETH","WETH",18, ethers.utils.parseUnits("1000",18)],
  MockWBTC:        ["Mock WBTC","WBTC",8, ethers.utils.parseUnits("100",8)],
  MockWMATIC:      ["Mock WMATIC","WMATIC",18,ethers.utils.parseUnits("5000000",18)],
};

async function verify(name, address, args) {
  console.log(`\n🔍 Verifying ${name}...`);
  try {
    await run("verify:verify", { address, constructorArguments: args });
    console.log(`✅ ${name} verified!`);
  } catch (e) {
    const msg = e.message.toLowerCase();
    if (msg.includes("already verified")) console.log(`ℹ️ ${name} already verified.`);
    else if (msg.includes("rate limited")) console.error(`⏳ ${name}: rate limited.`);
    else console.error(`❌ ${name} failed: ${e.message}`);
  }
}

async function main() {
  console.log("🚀 Starting verification on Polygon Amoy...");
  for (const [name, address] of Object.entries(addresses)) {
    await verify(name, address, constructorArgs[name]);
  }
  console.log("\n🎉 All done!");
}

main().catch(err => { console.error(err); process.exit(1); });
