
const { ethers } = require("hardhat");

async function main() {
    // Load addresses dynamically from the deployment artifact
    const deployment = require("../deployments/deployment.json");
    const VAULT_ADDRESS = deployment.contracts.CollateralVault;
    const TOKEN_ADDRESS = deployment.contracts.TGHSXToken;
    const WMATIC_ADDRESS = deployment.contracts.MockTokens.WMATIC;

    console.log("🔓 Withdrawing WMATIC collateral on Localhost...");

    // --- 1. SETUP ACCOUNTS AND CONTRACTS ---

    const [account] = await ethers.getSigners();
    console.log(`   - Using account: ${account.address}`);

    const collateralVault = await ethers.getContractAt("CollateralVault", VAULT_ADDRESS);
    const tghsxToken = await ethers.getContractAt("TGHSXToken", TOKEN_ADDRESS);
    const wmaticToken = await ethers.getContractAt("MockERC20", WMATIC_ADDRESS);

    // --- 2. REPAY DEBT ---
    console.log("\n--- Step 1: Repaying remaining tGHSX debt ---");
    const positionBefore = await collateralVault.getUserPosition(account.address, WMATIC_ADDRESS);
    const debtToRepay = positionBefore.mintedAmount;

    if (debtToRepay.isZero()) {
        console.log("   - No debt to repay. Proceeding to withdrawal.");
    } else {
        console.log(`   - Current Debt: ${ethers.utils.formatUnits(debtToRepay, 6)} tGHSX`);
        const burnTx = await collateralVault.connect(account).burnTokens(WMATIC_ADDRESS, debtToRepay);
        await burnTx.wait();
        console.log("✅ Debt repaid successfully!");
    }

    // --- 3. WITHDRAW COLLATERAL ---
    console.log("\n--- Step 2: Withdrawing WMATIC collateral ---");
    const amountToWithdraw = ethers.utils.parseUnits("500", 18); // Withdraw 500 WMATIC

    // We need to refresh the price feed to avoid the 'PriceStale' error
    console.log("   - Refreshing price feed timestamp...");
    const ORACLE_ROLE = await collateralVault.ORACLE_ROLE();
    // Grant the role if the account doesn't have it already
    if (!(await collateralVault.hasRole(ORACLE_ROLE, account.address))) {
        await collateralVault.grantRole(ORACLE_ROLE, account.address);
    }
    const currentPrice = (await collateralVault.collateralConfigs(WMATIC_ADDRESS)).price;
    await collateralVault.connect(account).updatePrice(WMATIC_ADDRESS, currentPrice);
    console.log("   - Price feed refreshed.");

    console.log(`   - Withdrawing ${ethers.utils.formatUnits(amountToWithdraw, 18)} WMATIC...`);
    const withdrawTx = await collateralVault.connect(account).withdrawCollateral(WMATIC_ADDRESS, amountToWithdraw);
    await withdrawTx.wait();
    console.log("✅ WMATIC withdrawn successfully!");

    // --- 4. VERIFY FINAL STATE ---
    console.log("\n--- Step 3: Verifying Final State ---");
    const finalWmaticBalance = await wmaticToken.balanceOf(account.address);
    const finalTghsxBalance = await tghsxToken.balanceOf(account.address);
    const finalPosition = await collateralVault.getUserPosition(account.address, WMATIC_ADDRESS);

    console.log(`   - Borrower's Final WMATIC Balance: ${ethers.utils.formatUnits(finalWmaticBalance, 18)}`);
    console.log(`   - Borrower's Final tGHSX Balance: ${ethers.utils.formatUnits(finalTghsxBalance, 6)}`);
    console.log("   ---------------------------------");
    console.log("   Final Position Details (WMATIC):");
    console.log(`   - Remaining Collateral: ${ethers.utils.formatUnits(finalPosition.collateralAmount, 18)} WMATIC`);
    console.log(`   - Remaining Debt: ${ethers.utils.formatUnits(finalPosition.mintedAmount, 6)} tGHSX`);

    console.log("\n🎉 Withdrawal test complete!");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Test failed:", error);
        process.exit(1);
    });
