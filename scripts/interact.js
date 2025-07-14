// scripts/interact.js
const { ethers } = require("hardhat");

// --- YOUR DEPLOYED ADDRESSES ---
const collateralVaultAddress = "0x8dc1E1E376E5f105Ee22b6a20F943bbd897e192B";
const tghsxTokenAddress = "0x7aD3121876c4F8104F3703efe3034CE632974943";
const wmaticTokenAddress = "0x13c09eAa18d75947A5426CaeDdEb65922400028c";
// ------------------------------------

async function main() {
    const [account] = await ethers.getSigners();
    console.log("🎬 Interacting with contracts using account:", account.address);

    const collateralVault = await ethers.getContractAt("CollateralVault", collateralVaultAddress);
    const wmaticToken = await ethers.getContractAt("MockERC20", wmaticTokenAddress);
    const tghsxToken = await ethers.getContractAt("TGHSXToken", tghsxTokenAddress);

    // Amounts to use (with correct decimals)
    const depositAmount = ethers.utils.parseUnits("1000", 18); // 1,000 WMATIC (18 decimals)
    const mintAmount = ethers.utils.parseUnits("400", 6);    // 400 tGHSX (6 decimals)

    console.log(`\n1. Approving Vault to spend ${ethers.utils.formatUnits(depositAmount, 18)} WMATIC...`);
    const approveTx = await wmaticToken.approve(collateralVault.address, depositAmount);
    await approveTx.wait();
    console.log("✅ Approval successful.");

    console.log(`\n2. Depositing ${ethers.utils.formatUnits(depositAmount, 18)} WMATIC into the Vault...`);
    const depositTx = await collateralVault.depositCollateral(wmaticToken.address, depositAmount);
    await depositTx.wait();
    console.log("✅ Deposit successful.");

    console.log(`\n3. Minting ${ethers.utils.formatUnits(mintAmount, 6)} tGHSX with a manual gas limit...`);
    const mintTx = await collateralVault.mintTokens(
        wmaticTokenAddress,
        mintAmount,
        { gasLimit: 500000 } // Set a generous, manual gas limit
    );
    await mintTx.wait();
    console.log("✅ Minting successful!");
    
    console.log("\n4. Checking final balances and position...");
    const finalWmaticBalance = await wmaticToken.balanceOf(account.address);
    const finalTghsxBalance = await tghsxToken.balanceOf(account.address);
    const position = await collateralVault.getUserPosition(account.address, wmaticTokenAddress);
    
    const expectedCollateralValue = (parseFloat(ethers.utils.formatUnits(position.collateralAmount, 18)) * 0.8).toFixed(2);

    console.log("   - Your WMATIC Balance:", ethers.utils.formatUnits(finalWmaticBalance, 18));
    console.log("   - Your tGHSX Balance:", ethers.utils.formatUnits(finalTghsxBalance, 6));
    console.log("   ---------------------------------");
    console.log("   Position Details:");
    console.log("   - Collateral Deposited:", ethers.utils.formatUnits(position.collateralAmount, 18), "WMATIC");
    console.log("   - tGHSX Minted:", ethers.utils.formatUnits(position.mintedAmount, 6), "tGHSX");
    console.log(`   - Collateral Value: $${ethers.utils.formatUnits(position.collateralValue, 6)} (Expected: ~$${expectedCollateralValue})`);
    
    // CORRECTED: The ratio from the contract is a percentage scaled by 1e6.
    // To display it, we just need to divide by 1e4 (or 1e6 / 100).
    const displayRatio = (position.collateralRatio.toNumber() / 10000).toFixed(2);
    console.log("   - Collateralization Ratio:", displayRatio, "%");


    console.log("\n🎉 Interaction with corrected contracts complete!");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Interaction failed:", error);
        process.exit(1);
    });
