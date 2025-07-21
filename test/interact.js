const { ethers } = require("hardhat");

async function main() {
    // CORRECTED: Load addresses dynamically from the deployment artifact
    const deployment = require("../deployments/deployment.json");
    const VAULT_ADDRESS = deployment.contracts.CollateralVault;
    const TOKEN_ADDRESS = deployment.contracts.TGHSXToken;
    const WMATIC_ADDRESS = deployment.contracts.MockTokens.WMATIC;

    console.log("🎬 Interacting with contracts...");

    // --- 1. SETUP ACCOUNTS AND CONTRACTS ---
    const [account] = await ethers.getSigners();
    console.log(`   - Using account: ${account.address}`);

    const collateralVault = await ethers.getContractAt("CollateralVault", VAULT_ADDRESS);
    const wmaticToken = await ethers.getContractAt("MockERC20", WMATIC_ADDRESS);
    const tghsxToken = await ethers.getContractAt("TGHSXToken", TOKEN_ADDRESS);

    // --- 2. DEPOSIT AND MINT ---
    const depositAmount = ethers.utils.parseUnits("1000", 18); // 1,000 WMATIC
    const mintAmount = ethers.utils.parseUnits("400", 6);    // 400 tGHSX

    console.log(`\n1. Approving Vault to spend ${ethers.utils.formatUnits(depositAmount, 18)} WMATIC...`);
    await wmaticToken.approve(VAULT_ADDRESS, depositAmount);
    console.log("✅ Approval successful.");

    console.log(`\n2. Depositing ${ethers.utils.formatUnits(depositAmount, 18)} WMATIC into the Vault...`);
    await collateralVault.depositCollateral(WMATIC_ADDRESS, depositAmount);
    console.log("✅ Deposit successful.");

    console.log(`\n3. Minting ${ethers.utils.formatUnits(mintAmount, 6)} tGHSX...`);
    await collateralVault.mintTokens(WMATIC_ADDRESS, mintAmount);
    console.log("✅ Minting successful.");

    // --- 3. VERIFY FINAL STATE ---
    console.log("\n4. Checking final balances and position...");
    const finalWmaticBalance = await wmaticToken.balanceOf(account.address);
    const finalTghsxBalance = await tghsxToken.balanceOf(account.address);
    const position = await collateralVault.getUserPosition(account.address, WMATIC_ADDRESS);
    
    const expectedCollateralValue = (1000 * 0.8).toFixed(2);

    console.log("   - Your WMATIC Balance:", ethers.utils.formatUnits(finalWmaticBalance, 18));
    console.log("   - Your tGHSX Balance:", ethers.utils.formatUnits(finalTghsxBalance, 6));
    console.log("   ---------------------------------");
    console.log("   Position Details:");
    console.log("   - Collateral Deposited:", ethers.utils.formatUnits(position.collateralAmount, 18), "WMATIC");
    console.log("   - tGHSX Minted:", ethers.utils.formatUnits(position.mintedAmount, 6), "tGHSX");
    console.log(`   - Collateral Value: $${ethers.utils.formatUnits(position.collateralValue, 6)} (Expected: ~$${expectedCollateralValue})`);
    
    // Fix: Handle potential overflow for collateralRatio
    let displayRatio;
    try {
        // Check if the ratio is max uint256 (indicates infinite/undefined)
        if (position.collateralRatio.eq(ethers.constants.MaxUint256)) {
            displayRatio = "Infinite";
        } else {
            displayRatio = (position.collateralRatio.toNumber() / 10000).toFixed(2) + "%";
        }
    } catch (error) {
        // Fallback: display raw value as string
        displayRatio = `${position.collateralRatio.toString()} (raw value - too large to convert)`;
    }
    
    console.log("   - Collateralization Ratio:", displayRatio);

    console.log("\n🎉 Interaction with local contracts complete!");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Interaction failed:", error);
        process.exit(1);
    });