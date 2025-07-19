
const { ethers } = require("hardhat");

// --- Addresses from your LATEST LOCALHOST deployment ---
const VAULT_ADDRESS = "#";
const TOKEN_ADDRESS = "#";
const USDC_ADDRESS = "#";
// ----------------------------------------------------

async function main() {
    console.log("🔓 Withdrawing USDC collateral...");

    // --- 1. SETUP ACCOUNTS AND CONTRACTS ---
    const [admin, borrower] = await ethers.getSigners();
    console.log(`   - Borrower: ${borrower.address}`);

    const collateralVault = await ethers.getContractAt("CollateralVault", VAULT_ADDRESS);
    const tghsxToken = await ethers.getContractAt("TGHSXToken", TOKEN_ADDRESS);
    const usdcToken = await ethers.getContractAt("MockERC20", USDC_ADDRESS);

    // --- PRE-RUN: We need to create a position first on this new deployment ---
    console.log("\n--- Pre-run Step: Creating a USDC position to test withdrawal ---");
    const depositAmount = ethers.utils.parseUnits("2000", 6); // 2,000 USDC
    const mintAmount = ethers.utils.parseUnits("800", 6); // 800 tGHSX
    
    await usdcToken.connect(admin).transfer(borrower.address, depositAmount);
    await usdcToken.connect(borrower).approve(VAULT_ADDRESS, depositAmount);
    await collateralVault.connect(borrower).depositCollateral(USDC_ADDRESS, depositAmount);
    await collateralVault.connect(borrower).mintTokens(USDC_ADDRESS, mintAmount);
    console.log("✅ Pre-run position created successfully.");
    // --- END PRE-RUN ---


    // --- 2. REPAY DEBT ---
    console.log("\n--- Step 1: Repaying remaining tGHSX debt ---");
    const positionBefore = await collateralVault.getUserPosition(borrower.address, USDC_ADDRESS);
    const debtToRepay = positionBefore.mintedAmount;

    if (debtToRepay.isZero()) {
        console.log("   - No debt to repay. Proceeding to withdrawal.");
    } else {
        console.log(`   - Current Debt: ${ethers.utils.formatUnits(debtToRepay, 6)} tGHSX`);
        const burnTx = await collateralVault.connect(borrower).burnTokens(USDC_ADDRESS, debtToRepay);
        await burnTx.wait();
        console.log("✅ Debt repaid successfully!");
    }

    // --- 3. WITHDRAW COLLATERAL ---
    console.log("\n--- Step 2: Withdrawing USDC collateral ---");
    const amountToWithdraw = ethers.utils.parseUnits("500", 6); // 500 USDC

    // We need to refresh the price feed to avoid the 'PriceStale' error
    console.log("   - Refreshing price feed timestamp...");
    const ORACLE_ROLE = await collateralVault.ORACLE_ROLE();
    await collateralVault.connect(admin).grantRole(ORACLE_ROLE, borrower.address);
    const currentPrice = (await collateralVault.collateralConfigs(USDC_ADDRESS)).price;
    await collateralVault.connect(borrower).updatePrice(USDC_ADDRESS, currentPrice);
    console.log("   - Price feed refreshed.");

    console.log(`   - Withdrawing ${ethers.utils.formatUnits(amountToWithdraw, 6)} USDC...`);
    const withdrawTx = await collateralVault.connect(borrower).withdrawCollateral(USDC_ADDRESS, amountToWithdraw);
    await withdrawTx.wait();
    console.log("✅ USDC withdrawn successfully!");

    // --- 4. VERIFY FINAL STATE ---
    console.log("\n--- Step 3: Verifying Final State ---");
    const finalUsdcBalance = await usdcToken.balanceOf(borrower.address);
    const finalTghsxBalance = await tghsxToken.balanceOf(borrower.address);
    const finalPosition = await collateralVault.getUserPosition(borrower.address, USDC_ADDRESS);

    console.log(`   - Borrower's Final USDC Balance: ${ethers.utils.formatUnits(finalUsdcBalance, 6)}`);
    console.log(`   - Borrower's Final tGHSX Balance: ${ethers.utils.formatUnits(finalTghsxBalance, 6)}`);
    console.log("   ---------------------------------");
    console.log("   Final Position Details (USDC):");
    console.log(`   - Remaining Collateral: ${ethers.utils.formatUnits(finalPosition.collateralAmount, 6)} USDC`);
    console.log(`   - Remaining Debt: ${ethers.utils.formatUnits(finalPosition.mintedAmount, 6)} tGHSX`);

    console.log("\n🎉 Withdrawal test complete!");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Test failed:", error);
        process.exit(1);
    });
