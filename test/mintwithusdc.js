
const { ethers } = require("hardhat");

async function main() {
    // Load addresses dynamically from the deployment artifact
    const deployment = require("../deployments/deployment.json");
    const VAULT_ADDRESS = deployment.contracts.CollateralVault;
    const TOKEN_ADDRESS = deployment.contracts.TGHSXToken;
    const USDC_ADDRESS = deployment.contracts.MockTokens.USDC;

    console.log("🪙  Minting tGHSX using USDC as collateral...");

    // --- 1. SETUP ACCOUNTS AND CONTRACTS ---
    const [admin, borrower] = await ethers.getSigners();
    console.log(`   - Admin:    ${admin.address}`);
    console.log(`   - Borrower: ${borrower.address}`);

    const collateralVault = await ethers.getContractAt("CollateralVault", VAULT_ADDRESS);
    const tghsxToken = await ethers.getContractAt("TGHSXToken", TOKEN_ADDRESS);
    const usdcToken = await ethers.getContractAt("MockERC20", USDC_ADDRESS);

    // --- 2. PREPARE BORROWER ---
    console.log("\n--- Step 1: Preparing the Borrower ---");
    const depositAmount = ethers.utils.parseUnits("1000", 6); // 1,000 USDC (6 decimals)
    
    // Admin sends mock USDC to the borrower
    await usdcToken.connect(admin).transfer(borrower.address, depositAmount);
    const borrowerUsdcBalance = await usdcToken.balanceOf(borrower.address);
    console.log(`✅ Borrower received ${ethers.utils.formatUnits(borrowerUsdcBalance, 6)} USDC.`);

    // --- 3. DEPOSIT AND MINT ---
    console.log("\n--- Step 2: Depositing USDC and Minting tGHSX ---");
    const mintAmount = ethers.utils.parseUnits("800", 6); // 800 tGHSX (6 decimals)

    // Borrower approves the vault to spend their USDC
    await usdcToken.connect(borrower).approve(VAULT_ADDRESS, depositAmount);
    console.log("   - Vault approved to spend USDC.");

    // Borrower deposits collateral
    await collateralVault.connect(borrower).depositCollateral(USDC_ADDRESS, depositAmount);
    console.log("   - 1,000 USDC deposited successfully.");

    // --- NEW STEP: Refresh the price feed to prevent staleness ---
    console.log("\n--- Step 2.5: Refreshing Price Feed ---");
    const ORACLE_ROLE = await collateralVault.ORACLE_ROLE();
    // Grant the borrower the ORACLE_ROLE so they can update the price
    await collateralVault.connect(admin).grantRole(ORACLE_ROLE, borrower.address);
    console.log("   - Borrower granted ORACLE_ROLE.");
    
    // Get the current price and re-submit it to update the timestamp
    const currentPrice = (await collateralVault.collateralConfigs(USDC_ADDRESS)).price;
    await collateralVault.connect(borrower).updatePrice(USDC_ADDRESS, currentPrice);
    console.log("   - USDC price feed timestamp refreshed.");
    // --- END NEW STEP ---

    // Borrower mints tGHSX
    await collateralVault.connect(borrower).mintTokens(USDC_ADDRESS, mintAmount);
    console.log(`   - ${ethers.utils.formatUnits(mintAmount, 6)} tGHSX minted successfully.`);

    // --- 4. VERIFY FINAL STATE ---
    console.log("\n--- Step 3: Verifying Final Position ---");
    const position = await collateralVault.getUserPosition(borrower.address, USDC_ADDRESS);
    const tghsxBalance = await tghsxToken.balanceOf(borrower.address);

    const collateralValueGHS = ethers.utils.formatUnits(position.collateralValue, 6);
    const mintedValueGHS = ethers.utils.formatUnits(position.mintedAmount, 6);
    const collateralRatio = (position.collateralRatio.toNumber() / 10000).toFixed(2);

    console.log("   - Borrower's tGHSX Balance:", ethers.utils.formatUnits(tghsxBalance, 6));
    console.log("   ---------------------------------");
    console.log("   Position Details (USDC):");
    console.log(`   - Collateral Value: ${collateralValueGHS} GHS`);
    console.log(`   - Minted (Debt): ${mintedValueGHS} tGHSX`);
    console.log(`   - Collateralization Ratio: ${collateralRatio}%`);

    console.log("\n🎉 Minting with USDC test complete!");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Test failed:", error);
        process.exit(1);
    });
