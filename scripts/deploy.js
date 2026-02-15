// scripts/deployamoy.js
const { ethers } = require("hardhat");
const { verify } = require("../utils/verify");
const fs = require('fs');

async function main() {
    console.log("🚀 Starting tGHSX Stablecoin System Deployment on Polygon Amoy...\n");

    const [deployer] = await ethers.getSigners();
    const network = await ethers.provider.getNetwork();
    const networkName = network.name === "amoy" ? "polygonAmoy" : "amoy";

    console.log("📝 Deploying contracts with account:", deployer.address);
    console.log("💰 Account balance:", ethers.utils.formatEther(await deployer.getBalance()), "ETH");
    console.log("🌐 Network:", networkName, `(Chain ID: ${network.chainId})\n`);

    const AMOY_CONFIG = {
        confirmations: 3
    };

    // --- USE PREVIOUSLY DEPLOYED MOCK TOKENS ---
    console.log("💎 Using previously deployed mock ERC20 token addresses...");
    const mockTokens = {
        USDC: "0xAC2f1680f2705d3Dd314534Bf24b424ccBC8D8f5",
        WETH: "0xF5FcbF9D665DC89b2d18f87a6994F04849dC80E5",
        WBTC: "0x6F74072d5AF1132B13c5a7226E41aAC1f8DBBdae",
        WMATIC: "0x13c09eAa18d75947A5426CaeDdEb65922400028c"
    };
    console.log(mockTokens);
    // -------------------------------------------------

    // --- 1. DEPLOY TGHSX TOKEN ---
    console.log("\n📄 1. Deploying TGHSXToken...");
    const TGHSXToken = await ethers.getContractFactory("TGHSXToken");
    const tghsxToken = await TGHSXToken.deploy();
    await tghsxToken.deployTransaction.wait(AMOY_CONFIG.confirmations);
    console.log("✅ TGHSXToken deployed to:", tghsxToken.address);

    // --- 2. DEPLOY COLLATERAL VAULT ---
    console.log("\n📄 2. Deploying CollateralVault...");
    const CollateralVault = await ethers.getContractFactory("CollateralVault");
    const collateralVault = await CollateralVault.deploy(tghsxToken.address, mockTokens.WMATIC);
    await collateralVault.deployTransaction.wait(AMOY_CONFIG.confirmations);
    console.log("✅ CollateralVault deployed to:", collateralVault.address);

    // --- 3. CONFIGURE ROLES AND VAULT ---
    console.log("\n⚙️ 3. Configuring contracts...");
    console.log("  > Granting MINTER_BURNER_ROLE to CollateralVault...");
    const MINTER_BURNER_ROLE = await tghsxToken.MINTER_BURNER_ROLE();
    await (await tghsxToken.grantRole(MINTER_BURNER_ROLE, collateralVault.address)).wait(AMOY_CONFIG.confirmations);
    console.log("  ✅ Role granted.");

    console.log("  > Adding collateral types to Vault...");
    const collateralData = [
        { symbol: "USDC", token: mockTokens.USDC, decimals: 6, price: ethers.utils.parseUnits("1", 6), maxLTV: 8500, liquidationBonus: 500 },
        { symbol: "WETH", token: mockTokens.WETH, decimals: 18, price: ethers.utils.parseUnits("3000", 6), maxLTV: 8000, liquidationBonus: 1000 },
        { symbol: "WBTC", token: mockTokens.WBTC, decimals: 8, price: ethers.utils.parseUnits("60000", 6), maxLTV: 7500, liquidationBonus: 1000 },
        { symbol: "WMATIC", token: mockTokens.WMATIC, decimals: 18, price: ethers.utils.parseUnits("0.8", 6), maxLTV: 7500, liquidationBonus: 1200 }
    ];

    for (const collateral of collateralData) {
        console.log(`    - Adding ${collateral.symbol}...`);
        await (await collateralVault.addCollateral(
            collateral.token,
            collateral.price,
            collateral.maxLTV,
            collateral.liquidationBonus,
            collateral.decimals
        )).wait(AMOY_CONFIG.confirmations);
        console.log(`    ✅ ${collateral.symbol} added.`);
    }

    // --- 4. VERIFICATION ---
    if (networkName !== "unknown" && process.env.POLYGONSCAN_API_KEY) {
        console.log("\n🔍 4. Verifying contracts on Polygonscan...");
        await verify(tghsxToken.address, []);
        await verify(collateralVault.address, [tghsxToken.address]);
    }

    // --- 5. SAVE DEPLOYMENT INFO ---
    console.log("\n💾 5. Saving deployment artifacts...");
    const deploymentInfo = {
        network: networkName,
        chainId: network.chainId,
        timestamp: new Date().toISOString(),
        deployer: deployer.address,
        contracts: {
            TGHSXToken: tghsxToken.address,
            CollateralVault: collateralVault.address,
            // Note: MockTokens are not deployed by this script, but included for reference
            MockTokens: mockTokens 
        }
    };
    if (!fs.existsSync('./deployments')) fs.mkdirSync('./deployments');
    const deploymentFile = `./deployments/${networkName}-deployment-${Date.now()}.json`;
    fs.writeFileSync(deploymentFile, JSON.stringify(deploymentInfo, null, 2));
    console.log("  ✅ Deployment info saved to:", deploymentFile);

    console.log("\n🎉 DEPLOYMENT COMPLETE! 🎉");
    console.log("=".repeat(60));
    console.log("TGHSXToken:", tghsxToken.address);
    console.log("CollateralVault:", collateralVault.address);
    console.log("=".repeat(60));
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Deployment failed:", error);
        process.exit(1);
    });
