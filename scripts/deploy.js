// scripts/deploy.js
const { ethers } = require("hardhat");
const { verify } = require("../utils/verify");
const fs = require('fs');

async function main() {
    console.log("🚀 Starting tGHSX Stablecoin System Deployment on Polygon Amoy...\n");

    const [deployer] = await ethers.getSigners();
    const network = await ethers.provider.getNetwork();
    const networkName = network.name === "amoy" ? "polygonAmoy" : "unknown";

    console.log("📝 Deploying contracts with account:", deployer.address);
    console.log("💰 Account balance:", ethers.utils.formatEther(await deployer.getBalance()), "ETH");
    console.log("🌐 Network:", networkName, `(Chain ID: ${network.chainId})\n`);

    const AMOY_CONFIG = {
        confirmations: 3
    };

    // --- 1. DEPLOY TGHSX TOKEN ---
    console.log("📄 1. Deploying TGHSXToken...");
    const TGHSXToken = await ethers.getContractFactory("TGHSXToken");
    const tghsxToken = await TGHSXToken.deploy();
    await tghsxToken.deployTransaction.wait(AMOY_CONFIG.confirmations);
    console.log("✅ TGHSXToken deployed to:", tghsxToken.address);

    // --- 2. DEPLOY COLLATERAL VAULT ---
    console.log("\n📄 2. Deploying CollateralVault...");
    const CollateralVault = await ethers.getContractFactory("CollateralVault");
    const collateralVault = await CollateralVault.deploy(tghsxToken.address);
    await collateralVault.deployTransaction.wait(AMOY_CONFIG.confirmations);
    console.log("✅ CollateralVault deployed to:", collateralVault.address);

    // --- 3. DEPLOY MOCK ERC20 COLLATERAL TOKENS ---
    console.log("\n💎 3. Deploying mock ERC20 tokens for testing...");
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const mockTokens = {};
    const tokenConfigs = [
        { name: "Mock USDC", symbol: "USDC", decimals: 6, supply: ethers.utils.parseUnits("1000000", 6) },
        { name: "Mock WETH", symbol: "WETH", decimals: 18, supply: ethers.utils.parseUnits("1000", 18) },
        { name: "Mock WBTC", symbol: "WBTC", decimals: 8, supply: ethers.utils.parseUnits("100", 8) },
    
        { name: "Mock WMATIC", symbol: "WMATIC", decimals: 18, supply: ethers.utils.parseUnits("5000000", 18) }
    ];

    for (const config of tokenConfigs) {
        console.log(`  > Deploying ${config.name} (${config.symbol})...`);
        const token = await MockERC20.deploy(config.name, config.symbol, config.decimals, config.supply);
        await token.deployTransaction.wait(AMOY_CONFIG.confirmations);
        mockTokens[config.symbol] = token.address;
        console.log(`  ✅ ${config.symbol} deployed to:`, token.address);
    }

    // --- 4. CONFIGURE ROLES AND VAULT ---
    console.log("\n⚙️ 4. Configuring contracts...");
    console.log("  > Granting MINTER_BURNER_ROLE to CollateralVault...");
    const MINTER_BURNER_ROLE = await tghsxToken.MINTER_BURNER_ROLE();
    await (await tghsxToken.grantRole(MINTER_BURNER_ROLE, collateralVault.address)).wait(AMOY_CONFIG.confirmations);
    console.log("  ✅ Role granted.");

    console.log("  > Adding collateral types to Vault...");
    const collateralData = [
        { symbol: "USDC", token: mockTokens.USDC, price: ethers.utils.parseUnits("1", 6), maxLTV: 8500, liquidationBonus: 500 },
        { symbol: "WETH", token: mockTokens.WETH, price: ethers.utils.parseUnits("3000", 6), maxLTV: 8000, liquidationBonus: 1000 },
        { symbol: "WBTC", token: mockTokens.WBTC, price: ethers.utils.parseUnits("60000", 6), maxLTV: 7500, liquidationBonus: 1000 },
       
        { symbol: "WMATIC", token: mockTokens.WMATIC, price: ethers.utils.parseUnits("0.8", 6), maxLTV: 7500, liquidationBonus: 1200 }
    ];

    for (const collateral of collateralData) {
        console.log(`    - Adding ${collateral.symbol}...`);
        await (await collateralVault.addCollateral(collateral.token, collateral.price, collateral.maxLTV, collateral.liquidationBonus)).wait(AMOY_CONFIG.confirmations);
        console.log(`    ✅ ${collateral.symbol} added.`);
    }

    // --- 5. VERIFICATION ---
    if (networkName !== "unknown" && process.env.POLYGONSCAN_API_KEY) {
        console.log("\n🔍 5. Verifying contracts on Polygonscan...");
        await verify(tghsxToken.address, []);
        await verify(collateralVault.address, [tghsxToken.address]);
        for (const config of tokenConfigs) {
           await verify(mockTokens[config.symbol], [config.name, config.symbol, config.decimals, config.supply]);
        }
    }

    // --- 6. SAVE DEPLOYMENT INFO ---
    console.log("\n💾 6. Saving deployment artifacts...");
    const deploymentInfo = {
        network: networkName,
        chainId: network.chainId,
        timestamp: new Date().toISOString(),
        deployer: deployer.address,
        contracts: {
            TGHSXToken: tghsxToken.address,
            CollateralVault: collateralVault.address,
            MockTokens: mockTokens
        }
    };
    if (!fs.existsSync('./deployments')) fs.mkdirSync('./deployments');
    const deploymentFile = `./deployments/${networkName}-deployment.json`;
    fs.writeFileSync(deploymentFile, JSON.stringify(deploymentInfo, null, 2));
    console.log("  ✅ Deployment info saved to:", deploymentFile);

    console.log("\n🎉 DEPLOYMENT COMPLETE! 🎉");
    console.log("=".repeat(60));
    console.log("TGHSXToken:", tghsxToken.address);
    console.log("CollateralVault:", collateralVault.address);
    console.log("Mock Tokens:", mockTokens);
    console.log("=".repeat(60));
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Deployment failed:", error);
        process.exit(1);
    });