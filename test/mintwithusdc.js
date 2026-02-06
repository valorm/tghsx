// ==========================================

// mintwithusdc.js - FIXED VERSION  
const { ethers } = require("hardhat");

async function main() {
    // Load addresses dynamically from the deployment artifact
    const deployment = require("../deployments/deployment.json");
    const VAULT_ADDRESS = deployment.contracts.CollateralVault;
    const TOKEN_ADDRESS = deployment.contracts.TGHSXToken;
    const USDC_ADDRESS = deployment.contracts.MockTokens.USDC;

    console.log("🪙  Debugging USDC minting issue...");

    // --- 1. SETUP ACCOUNTS AND CONTRACTS ---
    const [account] = await ethers.getSigners();
    console.log(`   - Using account: ${account.address}`);

    const collateralVault = await ethers.getContractAt("CollateralVault", VAULT_ADDRESS);
    const tghsxToken = await ethers.getContractAt("TGHSXToken", TOKEN_ADDRESS);
    const usdcToken = await ethers.getContractAt("MockERC20", USDC_ADDRESS);

    // --- 2. CHECK CURRENT STATE ---
    console.log("\n--- Debug: Current State Check ---");
    const initialUsdcBalance = await usdcToken.balanceOf(account.address);
    const initialTghsxBalance = await tghsxToken.balanceOf(account.address);
    console.log(`   - USDC Balance: ${ethers.utils.formatUnits(initialUsdcBalance, 6)}`);
    console.log(`   - tGHSX Balance: ${ethers.utils.formatUnits(initialTghsxBalance, 6)}`);

    // Check current position
    const currentPosition = await collateralVault.getUserPosition(account.address, USDC_ADDRESS);
    console.log("\n   - Current Position:");
    console.log(`     * Collateral Amount: ${ethers.utils.formatUnits(currentPosition.collateralAmount, 6)} USDC`);
    console.log(`     * Minted Amount: ${ethers.utils.formatUnits(currentPosition.mintedAmount, 6)} tGHSX`);
    console.log(`     * Collateral Value: ${ethers.utils.formatUnits(currentPosition.collateralValue, 6)} GHS`);

    // Check collateral configuration - FIXED to use correct field names
    const collateralConfig = await collateralVault.collateralConfigs(USDC_ADDRESS);
    console.log("\n   - USDC Collateral Config:");
    console.log(`     * Price: ${ethers.utils.formatUnits(collateralConfig.price, 6)} GHS per USDC`);
    console.log(`     * Max LTV: ${collateralConfig.maxLTV ? collateralConfig.maxLTV / 100 : 'undefined'}%`);
    console.log(`     * Liquidation Bonus: ${collateralConfig.liquidationBonus ? collateralConfig.liquidationBonus / 100 : 'undefined'}%`);
    console.log(`     * Is Enabled: ${collateralConfig.enabled}`);
    console.log(`     * Decimals: ${collateralConfig.decimals}`);

    // --- 3. CHECK USER/Vault LIMITS ---
    console.log("\n--- Debug: Mint Limits ---");
    try {
        const mintStatus = await collateralVault.getUserMintStatus(account.address);
        console.log(`   - Daily Minted: ${ethers.utils.formatUnits(mintStatus.dailyMinted, 6)} tGHSX`);
        console.log(`   - Remaining Daily: ${ethers.utils.formatUnits(mintStatus.remainingDaily, 6)} tGHSX`);
        console.log(`   - Cooldown Remaining: ${mintStatus.cooldownRemaining.toString()}s`);
        console.log(`   - Daily Mint Count: ${mintStatus.dailyMintCount.toString()}`);
        console.log(`   - Remaining Mints: ${mintStatus.remainingMints.toString()}`);
    } catch (error) {
        console.log("   - Could not fetch user mint status:", error.message);
    }

    try {
        const vaultStatus = await collateralVault.getVaultStatus();
        console.log(`   - Global Daily Minted: ${ethers.utils.formatUnits(vaultStatus.dailyMinted, 6)} tGHSX`);
        console.log(`   - Global Daily Remaining: ${ethers.utils.formatUnits(vaultStatus.globalDailyRemaining, 6)} tGHSX`);
        console.log(`   - AutoMint Enabled: ${vaultStatus.autoMintActive}`);
        console.log(`   - Contract Paused: ${vaultStatus.contractPaused}`);
    } catch (error) {
        console.log("   - Could not fetch vault status:", error.message);
    }

    // --- 4. CHECK IF CONFIG IS VALID ---
    if (!collateralConfig.maxLTV || collateralConfig.maxLTV === 0) {
        console.log("\n❌ CRITICAL ISSUE: maxLTV is not configured properly!");
        console.log("   - Cannot calculate mint amounts without maxLTV");
        console.log("   - Please configure the collateral first using the contract admin functions");
        return;
    }

    if (!collateralConfig.enabled) {
        console.log("\n❌ CRITICAL ISSUE: USDC collateral is not enabled!");
        console.log("   - Please enable USDC collateral first");
        return;
    }

    // --- 5. CALCULATE SAFE MINT AMOUNT - FIXED ---
    console.log("\n--- Debug: Calculate Safe Mint Amount ---");
    const depositedAmount = currentPosition.collateralAmount;
    const collateralValueInGHS = currentPosition.collateralValue;
    
    // maxLTV is in basis points (e.g., 8500 = 85%)
    const maxLTVBasisPoints = collateralConfig.maxLTV;
    const maxLTVPercent = maxLTVBasisPoints / 100; // Convert to percentage
    
    // Maximum mintable = (collateral value * maxLTV) / 100
    const maxMintable = collateralValueInGHS.mul(maxLTVBasisPoints).div(10000); // Divide by 10000 for basis points
    const alreadyMinted = currentPosition.mintedAmount;
    const availableToMint = alreadyMinted.gt(maxMintable) ? ethers.constants.Zero : maxMintable.sub(alreadyMinted);
    
    console.log(`   - Deposited USDC: ${ethers.utils.formatUnits(depositedAmount, 6)}`);
    console.log(`   - Collateral Value: ${ethers.utils.formatUnits(collateralValueInGHS, 6)} GHS`);
    console.log(`   - Max LTV: ${maxLTVPercent}% (${maxLTVBasisPoints} basis points)`);
    console.log(`   - Max Mintable: ${ethers.utils.formatUnits(maxMintable, 6)} tGHSX`);
    console.log(`   - Already Minted: ${ethers.utils.formatUnits(alreadyMinted, 6)} tGHSX`);
    console.log(`   - Available to Mint: ${ethers.utils.formatUnits(availableToMint, 6)} tGHSX`);

    // --- 6. ATTEMPT SAFER MINT ---
    const proposedMintAmount = ethers.utils.parseUnits("100", 6); // Start with smaller amount
    console.log(`\n   - Proposed Mint: ${ethers.utils.formatUnits(proposedMintAmount, 6)} tGHSX`);
    
    if (availableToMint.lt(proposedMintAmount)) {
        console.log("❌ ERROR: Proposed mint amount exceeds available capacity!");
        console.log(`   - Try minting maximum: ${ethers.utils.formatUnits(availableToMint, 6)} tGHSX instead`);
        
        if (availableToMint.gt(0)) {
            // Try with available amount
            console.log(`\n--- Attempting Max Available Mint: ${ethers.utils.formatUnits(availableToMint, 6)} tGHSX ---`);
            
            try {
                const tx = await collateralVault.mintTokens(USDC_ADDRESS, availableToMint);
                console.log("✅ Max available mint successful!");
                console.log(`   - Transaction hash: ${tx.hash}`);
            } catch (error) {
                console.log("❌ Max available mint also failed:", error.message);
                
                // Try static call to get exact revert reason
                try {
                    await collateralVault.callStatic.mintTokens(USDC_ADDRESS, availableToMint);
                } catch (staticError) {
                    console.log("❌ Static call revert reason:", staticError.message);
                }
            }
        } else {
            console.log("❌ No mintable amount available");
        }
    } else {
        console.log("✅ Proposed mint amount should be safe. Attempting mint...");
        
        try {
            // Try static call first
            await collateralVault.callStatic.mintTokens(USDC_ADDRESS, proposedMintAmount);
            console.log("✅ Static call passed - executing transaction...");
            
            const tx = await collateralVault.mintTokens(USDC_ADDRESS, proposedMintAmount);
            console.log("✅ Mint successful!");
            console.log(`   - Transaction hash: ${tx.hash}`);
            
        } catch (error) {
            console.log("❌ Mint failed:", error.message);
            
            // Additional debugging
            console.log("\n--- Additional Debugging ---");
            
            // Check if contract is paused
            try {
                const isPaused = await collateralVault.paused();
                console.log(`   - Contract Paused: ${isPaused}`);
            } catch (e) {
                console.log("   - Contract doesn't seem to have pause functionality");
            }
            
            // Check minter role
            try {
                const MINTER_ROLE = await tghsxToken.MINTER_ROLE();
                const hasMinterRole = await tghsxToken.hasRole(MINTER_ROLE, VAULT_ADDRESS);
                console.log(`   - Vault has MINTER_ROLE: ${hasMinterRole}`);
            } catch (e) {
                console.log("   - Could not check MINTER_ROLE");
            }
            
            // Check total supply limits
            try {
                const totalSupply = await tghsxToken.totalSupply();
                console.log(`   - Current tGHSX Total Supply: ${ethers.utils.formatUnits(totalSupply, 6)}`);
            } catch (e) {
                console.log("   - Could not check total supply");
            }
        }
    }

    console.log("\n🔍 Debug analysis complete!");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Debug failed:", error);
        process.exit(1);
    });
