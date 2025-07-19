const { ethers, network } = require("hardhat");

async function main() {
    // Load addresses dynamically from the deployment artifact
    const deployment = require("../deployments/deployment.json");
    const VAULT_ADDRESS = deployment.contracts.CollateralVault;
    const TOKEN_ADDRESS = deployment.contracts.TGHSXToken;
    const WMATIC_ADDRESS = deployment.contracts.MockTokens.WMATIC;

    console.log("🌊 Testing Liquidation Process on Localhost...");

    // --- 1. SETUP ACCOUNTS AND CONTRACTS ---
    const [admin, , liquidatorSigner] = await ethers.getSigners();
    const borrower = ethers.Wallet.createRandom().connect(ethers.provider);

    // Fund the new accounts with ETH for gas fees
    await admin.sendTransaction({ to: borrower.address, value: ethers.utils.parseEther("1.0") });
    
    console.log(`   - Admin:      ${admin.address}`);
    console.log(`   - Borrower:   ${borrower.address} (New random account)`);
    console.log(`   - Liquidator: ${liquidatorSigner.address}`);

    const collateralVault = await ethers.getContractAt("CollateralVault", VAULT_ADDRESS);
    const tghsxToken = await ethers.getContractAt("TGHSXToken", TOKEN_ADDRESS);
    const wmaticToken = await ethers.getContractAt("MockERC20", WMATIC_ADDRESS);

    // --- 2. CREATE A POSITION TO BE LIQUIDATED ---
    console.log("\n--- Step 1: Borrower creates a position ---");
    const depositAmount = ethers.utils.parseUnits("1000", 18); // 1,000 WMATIC
    const mintAmount = ethers.utils.parseUnits("500", 6);    // 500 tGHSX

    // Borrower needs WMATIC first. Admin sends it.
    await wmaticToken.connect(admin).transfer(borrower.address, depositAmount);
    
    await wmaticToken.connect(borrower).approve(VAULT_ADDRESS, depositAmount);
    await collateralVault.connect(borrower).depositCollateral(WMATIC_ADDRESS, depositAmount);
    await collateralVault.connect(borrower).mintTokens(WMATIC_ADDRESS, mintAmount);
    
    let position = await collateralVault.getUserPosition(borrower.address, WMATIC_ADDRESS);
    let ratio = (position.collateralRatio.toNumber() / 10000).toFixed(2);
    console.log(`✅ Position created. Initial Ratio: ${ratio}% (Healthy)`);

    // --- 3. PREPARE THE LIQUIDATOR ---
    console.log("\n--- Step 2: Prepare the Liquidator ---");
    // Borrower sends the minted tGHSX to the liquidator
    await tghsxToken.connect(borrower).transfer(liquidatorSigner.address, mintAmount);
    // Admin grants the LIQUIDATOR_ROLE
    const LIQUIDATOR_ROLE = await collateralVault.LIQUIDATOR_ROLE();
    await collateralVault.connect(admin).grantRole(LIQUIDATOR_ROLE, liquidatorSigner.address);
    console.log("✅ Liquidator has received tGHSX and been granted the LIQUIDATOR_ROLE.");

    // --- 4. SIMULATE PRICE CRASH ---
    console.log("\n--- Step 3: Simulate WMATIC Price Crash ---");
    
    const ORACLE_ROLE = await collateralVault.ORACLE_ROLE();
    await collateralVault.connect(admin).grantRole(ORACLE_ROLE, admin.address);
    console.log("   - Admin granted itself the ORACLE_ROLE.");

    // Price of WMATIC drops from 0.80 to 0.60 GHS to trigger liquidation
    const crashedPrice = ethers.utils.parseUnits("0.60", 6);
    await collateralVault.connect(admin).updatePrice(WMATIC_ADDRESS, crashedPrice);
    
    position = await collateralVault.getUserPosition(borrower.address, WMATIC_ADDRESS);
    ratio = (position.collateralRatio.toNumber() / 10000).toFixed(2);
    const isLiquidatable = position.isLiquidatable;
    console.log(`✅ Price updated. New Ratio: ${ratio}% (Unhealthy)`);
    console.log(`   - Is position liquidatable? ${isLiquidatable}`);
    if (!isLiquidatable) {
        console.error("❌ TEST SETUP FAILED: Position is not liquidatable after price crash.");
        return;
    }

    // --- 5. EXECUTE LIQUIDATION ---
    console.log("\n--- Step 4: Execute Liquidation ---");
    console.log("   - Checking pre-liquidation balances...");
    const liquidatorWmaticBefore = await wmaticToken.balanceOf(liquidatorSigner.address);
    const liquidatorTghsxBefore = await tghsxToken.balanceOf(liquidatorSigner.address);
    console.log(`   - Liquidator WMATIC: ${ethers.utils.formatUnits(liquidatorWmaticBefore, 18)}`);
    console.log(`   - Liquidator tGHSX: ${ethers.utils.formatUnits(liquidatorTghsxBefore, 6)}`);
    
    // The liquidator needs to approve the vault to burn their tGHSX
    await tghsxToken.connect(liquidatorSigner).approve(VAULT_ADDRESS, mintAmount);
    console.log("\n   - Liquidator calls liquidate()...");
    const liquidateTx = await collateralVault.connect(liquidatorSigner).liquidate(borrower.address, WMATIC_ADDRESS);
    await liquidateTx.wait();
    console.log("✅ Liquidation successful!");

    // --- 6. VERIFY OUTCOME ---
    console.log("\n--- Step 5: Verify Post-Liquidation State ---");
    const liquidatorWmaticAfter = await wmaticToken.balanceOf(liquidatorSigner.address);
    const liquidatorTghsxAfter = await tghsxToken.balanceOf(liquidatorSigner.address);
    const borrowerPositionAfter = await collateralVault.getUserPosition(borrower.address, WMATIC_ADDRESS);

    const actualWmaticGain = liquidatorWmaticAfter.sub(liquidatorWmaticBefore);

    console.log("   Borrower's Position:");
    console.log(`   - Collateral: ${borrowerPositionAfter.collateralAmount.toString()}`);
    console.log(`   - Debt: ${borrowerPositionAfter.mintedAmount.toString()}`);
    console.log("\n   Liquidator's Balances:");
    console.log(`   - WMATIC Balance: ${ethers.utils.formatUnits(liquidatorWmaticAfter, 18)}`);
    console.log(`   - tGHSX Balance: ${ethers.utils.formatUnits(liquidatorTghsxAfter, 6)} (Expected: 0.0)`);

    if (borrowerPositionAfter.collateralAmount.isZero() && liquidatorTghsxAfter.isZero()) {
        console.log("\n🎉 SUCCESS: Borrower's position was cleared and liquidator's balances are correct.");
    } else {
        console.error("\n❌ FAILED: State after liquidation is incorrect.");
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Liquidation test failed:", error);
        process.exit(1);
    });
