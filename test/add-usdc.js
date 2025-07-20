// add-usdc.js
const { ethers } = require("hardhat");

async function main() {
    const VAULT_ADDRESS = "0xF681Ba510d3C93A49a7AB2d02d9697BB2B0091FE";
    const USDC_ADDRESS = "0xAC2f1680f2705d3Dd314534Bf24b424ccBC8D8f5";
    const vault = await ethers.getContractAt("CollateralVault", VAULT_ADDRESS);

    // Set config parameters
    const initialPrice = ethers.BigNumber.from("1000000"); // 1 USDC = $1.00 (6 decimals)
    const maxLTV = 8500;           // 85%
    const liquidationBonus = 500;  // 5%
    const decimals = 6;            // USDC typically has 6 decimals

    const tx = await vault.addCollateral(
        USDC_ADDRESS,
        initialPrice,
        maxLTV,
        liquidationBonus,
        decimals
    );

    console.log("⏳ Adding USDC as collateral...");
    await tx.wait();
    console.log("✅ USDC added successfully!");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
