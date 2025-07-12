/**
 * ==================================================================================
 * Main dApp Logic (index.js) - FINAL VERSION
 *
 * This script handles all core functionalities of the tGHSX minting and vault
 * management page (index.html). It now uses direct on-chain transactions for
 * minting and relies on the smart contract as the single source of truth for price.
 * ==================================================================================
 */

import { appState, showToast, getErrorMessage, BACKEND_URL, formatAddress } from './shared-wallet.js';

const CONFIG = {
    LIMITS: {
        MIN_COLLATERAL_RATIO: 150,
        MAX_TRANSACTION_VALUE: 100, // Max ETH per transaction
        MIN_COLLATERAL_AMOUNT: 0.001,
        MIN_MINT_AMOUNT: 1
    },
    PRICE_FEEDS: {
        UPDATE_INTERVAL: 30000, // 30 seconds
    },
    UI: { 
        DEBOUNCE_DELAY: 300, 
    },
    GAS_UNITS: { 
        DEPOSIT_MINT: 200000, 
        REPAY_WITHDRAW: 220000 
    },
};

let localState = {
    ethPriceGHS: 0,
    lastEthPrice: null,
    userBalance: '0',
    autoRefreshInterval: null,
    lastPriceUpdate: null,
    liveGasPrice: null,
    currentTransaction: null,
    estimatedMintFeeMatic: '0',
    estimatedRepayFeeMatic: '0'
};

const elements = {
    ethToGhsRate: document.getElementById('ethToGhsRate'),
    ethToGhsRate2: document.getElementById('ethToGhsRate2'),
    collateralInput: document.getElementById('collateralInput'),
    mintInput: document.getElementById('mintInput'),
    ratioDisplay: document.getElementById('ratioDisplay'),
    warningMsg: document.getElementById('warningMsg'),
    mintButton: document.getElementById('mintButton'),
    mintButtonText: document.getElementById('mintButtonText'),
    ethBalance: document.getElementById('ethBalance'),
    networkStatus: document.getElementById('networkStatus'),
    networkName: document.getElementById('networkName'),
    networkIndicator: document.getElementById('networkIndicator'),
    blockNumber: document.getElementById('blockNumber'),
    ethPrice: document.getElementById('ethPrice'),
    vaultCollateral: document.getElementById('vaultCollateral'),
    vaultDebt: document.getElementById('vaultDebt'),
    vaultRatio: document.getElementById('vaultRatio'),
    vaultHealthBadge: document.getElementById('vaultHealthBadge'),
    repayInput: document.getElementById('repayInput'),
    withdrawInput: document.getElementById('withdrawInput'),
    repayButton: document.getElementById('repayButton'),
    maxMintableText: document.getElementById('maxMintable'),
    gasPriceDisplay: document.getElementById('gasPriceDisplay'),
    riskModalOverlay: document.getElementById('riskModalOverlay'),
    riskCheckbox: document.getElementById('riskCheckbox'),
    proceedRiskBtn: document.getElementById('proceedRiskBtn'),
    declineRiskBtn: document.getElementById('declineRiskBtn'),
    liquidationPrice: document.getElementById('liquidationPrice'),
    riskLevelBar: document.getElementById('riskLevelBar'),
    priceChangeIndicator: document.getElementById('priceChangeIndicator'),
    priceLastUpdated: document.getElementById('priceLastUpdated'),
    mintFeeEstimate: document.getElementById('mintFeeEstimate'),
    repayFeeEstimate: document.getElementById('repayFeeEstimate'),
    confirmationModal: document.getElementById('confirmationModal'),
    confirmationTitle: document.getElementById('confirmationTitle'),
    modalAction: document.getElementById('modalAction'),
    modalSummary2Label: document.getElementById('modalSummary2Label'),
    modalSummary2Value: document.getElementById('modalSummary2Value'),
    modalSummary3Label: document.getElementById('modalSummary3Label'),
    modalSummary3Value: document.getElementById('modalSummary3Value'),
    modalCurrentCollateral: document.getElementById('modalCurrentCollateral'),
    modalNewCollateral: document.getElementById('modalNewCollateral'),
    modalCurrentRatio: document.getElementById('modalCurrentRatio'),
    modalNewRatio: document.getElementById('modalNewRatio'),
    modalRiskWarning: document.getElementById('modalRiskWarning'),
    modalRiskWarningText: document.getElementById('modalRiskWarningText'),
    modalNetworkFee: document.getElementById('modalNetworkFee'),
    modalReceiveContainer: document.getElementById('modalReceiveContainer'),
    modalYouReceive: document.getElementById('modalYouReceive'),
    modalExchangeRate: document.getElementById('modalExchangeRate'),
    closeConfirmationBtn: document.getElementById('closeConfirmationBtn'),
    cancelConfirmationBtn: document.getElementById('cancelConfirmationBtn'),
    proceedTransactionBtn: document.getElementById('proceedTransactionBtn'),
    tokenSelector: document.getElementById('tokenSelector'),
    presetButtons: document.querySelector('.preset-buttons'),
    maxCollateralBtn: document.getElementById('maxCollateralBtn'),
    maxMintBtn: document.getElementById('maxMintBtn'),
    maxRepayBtn: document.getElementById('maxRepayBtn'),
    maxWithdrawBtn: document.getElementById('maxWithdrawBtn'),
    protocolStatusBanner: document.getElementById('protocolStatusBanner'),
    protocolStatusText: document.getElementById('protocolStatusText'),
    appContent: document.getElementById('app-content'),
    riskDeclinedOverlay: document.getElementById('riskDeclinedOverlay'),
};

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function formatNumber(num, decimals = 2) {
    if (num === null || num === undefined || isNaN(num)) return '0.00';
    return parseFloat(num).toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
        useGrouping: false
    });
}

function formatCurrency(amount, currency = 'GH₵') {
    if (amount === null || amount === undefined || isNaN(amount)) return `${currency} 0.00`;
    return `${currency} ${parseFloat(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function resetUI() {
    elements.ethBalance.textContent = 'Balance: 0.00';
    elements.vaultCollateral.textContent = '0.00';
    elements.vaultDebt.textContent = '0.00';
    elements.vaultRatio.textContent = '--%';
    elements.vaultHealthBadge.textContent = 'Not Connected';
    elements.vaultHealthBadge.className = 'collateral-ratio-badge';
    if (elements.maxMintableText) elements.maxMintableText.textContent = 'Max: 0.00 tGHSX';
    elements.ratioDisplay.textContent = '--%';
    elements.liquidationPrice.textContent = '-- GH₵';
    elements.riskLevelBar.style.width = '0%';
    elements.ethToGhsRate.textContent = 'GH₵ 0.00';
    elements.ethToGhsRate2.textContent = 'GH₵ 0.00';
    elements.priceChangeIndicator.textContent = '';
    elements.priceLastUpdated.textContent = 'Updated: --:--:--';
    elements.mintFeeEstimate.textContent = '';
    elements.repayFeeEstimate.textContent = '';
    updateMintButtonState();
    togglePresetButtons(false);
}

async function refreshAllData() {
    if (!appState.userAccount || !appState.isCorrectNetwork) return;
    
    await Promise.allSettled([
        loadUserVaultData(),
        loadUserBalance(),
        loadETHPrice(),
        loadGasPrice()
    ]);

    const blockNumber = await appState.provider.getBlockNumber();
    elements.blockNumber.textContent = `Block: ${blockNumber}`;
    startAutoRefresh();
}

function startAutoRefresh() {
    stopAutoRefresh();
    if (appState.isCorrectNetwork) {
        localState.autoRefreshInterval = setInterval(refreshAllData, CONFIG.PRICE_FEEDS.UPDATE_INTERVAL);
    }
}

function stopAutoRefresh() {
    if (localState.autoRefreshInterval) {
        clearInterval(localState.autoRefreshInterval);
        localState.autoRefreshInterval = null;
    }
}

async function loadUserBalance() {
    if (!appState.provider || !appState.userAccount) return;
    try {
        const balance = await appState.provider.getBalance(appState.userAccount);
        localState.userBalance = ethers.utils.formatEther(balance);
        elements.ethBalance.textContent = `Balance: ${parseFloat(localState.userBalance).toFixed(4)}`;
        togglePresetButtons(parseFloat(localState.userBalance) > 0);
    } catch (error) {
        console.error('Error loading user balance:', error);
        elements.ethBalance.textContent = 'Balance: Error';
        togglePresetButtons(false);
    }
}

async function loadUserVaultData() {
    if (!appState.collateralVaultContract || !appState.userAccount) return;

    try {
        const [collateral, debt, ratioWei] = await appState.collateralVaultContract.getUserPosition(appState.userAccount);

        const collateralEth = ethers.utils.formatEther(collateral);
        const debtAmount = ethers.utils.formatEther(debt);
        
        let ratioPercent = ratioWei.eq(ethers.constants.MaxUint256) ? Infinity : parseFloat(ethers.utils.formatUnits(ratioWei, 2));

        elements.vaultCollateral.textContent = parseFloat(collateralEth).toFixed(4);
        elements.vaultDebt.textContent = parseFloat(debtAmount).toFixed(2);
        elements.vaultRatio.textContent = isFinite(ratioPercent) ? `${ratioPercent.toFixed(2)}%` : '∞%';
        
        updateHealthBadge(ratioPercent);
        updateLiquidationPrice();
        updateRiskMeter(ratioPercent);

    } catch (error) {
        console.error('Error loading vault data:', error);
    }
}

async function loadETHPrice() {
    if (!appState.collateralVaultContract) {
        console.warn("Cannot load price, contract not ready.");
        return;
    }

    try {
        localState.lastEthPrice = localState.ethPriceGHS;
        const priceWei = await appState.collateralVaultContract.getEthGhsPrice();
        localState.ethPriceGHS = parseFloat(ethers.utils.formatUnits(priceWei, 8));
    } catch (error) {
         console.error(`On-chain price fetch failed: ${getErrorMessage(error)}`);
         showToast("Could not fetch live price from the blockchain.", "error");
    } finally {
        localState.lastPriceUpdate = new Date();
        elements.ethToGhsRate.textContent = formatCurrency(localState.ethPriceGHS, '');
        elements.ethToGhsRate2.textContent = formatCurrency(localState.ethPriceGHS, '');
        elements.ethPrice.textContent = formatCurrency(localState.ethPriceGHS);
        updatePriceChangeIndicator();
        calculateMaxMintable();
        updateFeeEstimates();
    }
}

async function loadGasPrice() {
    if (!appState.provider) return;
    try {
        const gasPrice = await appState.provider.getGasPrice();
        localState.liveGasPrice = gasPrice; 
        const gasPriceInGwei = ethers.utils.formatUnits(gasPrice, "gwei");
        elements.gasPriceDisplay.textContent = `${parseFloat(gasPriceInGwei).toFixed(2)} Gwei`;
        updateFeeEstimates(); 
    } catch (error) {
        console.error('Error loading gas price:', error);
        elements.gasPriceDisplay.textContent = 'Error';
    }
}

function updateHealthBadge(ratio) {
    elements.vaultHealthBadge.className = 'collateral-ratio-badge';
    let status = 'No Debt';
    let className = '';

    if (isFinite(ratio) && ratio > 0) {
         if (ratio > 200) { status = 'Healthy'; } 
         else if (ratio >= CONFIG.LIMITS.MIN_COLLATERAL_RATIO) { status = 'Moderate'; className = 'warning'; } 
         else { status = 'At Risk'; className = 'danger'; }
    } else if (parseFloat(elements.vaultDebt.textContent) > 0) {
         status = 'At Risk';
         className = 'danger';
    }

    elements.vaultHealthBadge.innerHTML = `<i class="fas fa-shield-alt"></i> ${status}`;
    if(className) elements.vaultHealthBadge.classList.add(className);
}

function updateLiquidationPrice() {
    const collateral = parseFloat(elements.vaultCollateral.textContent) || 0;
    const debt = parseFloat(elements.vaultDebt.textContent) || 0;
    
    if (collateral <= 0 || debt <= 0 || !localState.ethPriceGHS) {
        elements.liquidationPrice.textContent = '-- GH₵';
        return;
    }
    
    const liquidationPrice = (debt * (CONFIG.LIMITS.MIN_COLLATERAL_RATIO / 100)) / collateral;
    elements.liquidationPrice.textContent = `${liquidationPrice.toFixed(2)} GH₵`;
}

function updateRiskMeter(ratio) {
    if (!isFinite(ratio)) {
        elements.riskLevelBar.style.width = '0%';
        return;
    }
    const riskLevel = ratio >= 300 ? 0 : (ratio <= CONFIG.LIMITS.MIN_COLLATERAL_RATIO ? 100 : ((300 - ratio) / (300 - CONFIG.LIMITS.MIN_COLLATERAL_RATIO)) * 100);
    elements.riskLevelBar.style.width = `${Math.min(100, Math.max(0, riskLevel))}%`;
}

function updatePriceChangeIndicator() {
    if (!localState.lastEthPrice || !localState.ethPriceGHS || localState.lastEthPrice === localState.ethPriceGHS) {
        elements.priceChangeIndicator.textContent = '';
        return;
    }
    const change = ((localState.ethPriceGHS - localState.lastEthPrice) / localState.lastEthPrice) * 100;
    elements.priceChangeIndicator.className = `price-change ${change >= 0 ? 'up' : 'down'}`;
    elements.priceChangeIndicator.textContent = `(${change >= 0 ? '+' : ''}${change.toFixed(2)}%)`;
    elements.priceLastUpdated.textContent = `Updated: ${localState.lastPriceUpdate.toLocaleTimeString()}`;
}

async function updateFeeEstimates() {
    if (!localState.liveGasPrice || !appState.collateralVaultContract) return;

    const gasPrice = ethers.BigNumber.from(localState.liveGasPrice);
    
    try {
        let estimatedGasLimitMint = ethers.BigNumber.from(CONFIG.GAS_UNITS.DEPOSIT_MINT);
        const mintFeeInWei = gasPrice.mul(estimatedGasLimitMint);
        const mintFeeInMatic = ethers.utils.formatEther(mintFeeInWei);
        localState.estimatedMintFeeMatic = mintFeeInMatic;
        elements.mintFeeEstimate.textContent = `Est. Gas: ~${parseFloat(mintFeeInMatic).toFixed(5)} MATIC`;
    } catch (e) {
        localState.estimatedMintFeeMatic = '0';
        elements.mintFeeEstimate.textContent = 'Est. Gas: Unable to estimate';
    }
    
    try {
        let estimatedGasLimitRepay = ethers.BigNumber.from(CONFIG.GAS_UNITS.REPAY_WITHDRAW);
        const repayFeeInWei = gasPrice.mul(estimatedGasLimitRepay);
        const repayFeeInMatic = ethers.utils.formatEther(repayFeeInWei);
        localState.estimatedRepayFeeMatic = repayFeeInMatic;
        elements.repayFeeEstimate.textContent = `Est. Gas: ~${parseFloat(repayFeeInMatic).toFixed(5)} MATIC`;
    } catch (e) {
        localState.estimatedRepayFeeMatic = '0';
        elements.repayFeeEstimate.textContent = 'Est. Gas: Unable to estimate';
    }
}

function updateMintButtonState() {
    const collateralAmount = parseFloat(elements.collateralInput.value || '0');
    const mintAmount = parseFloat(elements.mintInput.value || '0');
    let disabled = false;
    let text = 'Deposit & Mint tGHSX';

    if (appState.isProtocolPaused) {
        disabled = true;
        text = 'Protocol Paused';
    } else if (!appState.userAccount) {
        disabled = true;
        text = 'Connect Wallet First';
    } else if (!appState.isCorrectNetwork) {
        disabled = true;
        text = 'Wrong Network';
    } else if (collateralAmount <= 0 || mintAmount <= 0) {
        disabled = true;
        text = 'Enter Amounts';
    }
    
    elements.mintButton.disabled = disabled;
    elements.mintButtonText.innerHTML = `<i class="fas fa-plus-circle"></i> ${text}`;
}

const debouncedCalculateRatio = debounce(() => {
    calculateCollateralRatio();
    updateFeeEstimates();
}, CONFIG.UI.DEBOUNCE_DELAY);

function calculateCollateralRatio() {
    const collateralAmount = parseFloat(elements.collateralInput.value || '0');
    const mintAmount = parseFloat(elements.mintInput.value || '0');
    
    if (collateralAmount === 0 || mintAmount === 0 || !localState.ethPriceGHS) {
        elements.ratioDisplay.textContent = `--%`;
        elements.ratioDisplay.className = 'ratio-value';
        elements.warningMsg.classList.add('hidden');
    } else {
        const collateralValueGHS = collateralAmount * localState.ethPriceGHS;
        const ratio = (collateralValueGHS / mintAmount) * 100;
        elements.ratioDisplay.textContent = `${ratio.toFixed(1)}%`;
        elements.ratioDisplay.className = 'ratio-value';
        if (ratio < 200 && ratio >= CONFIG.LIMITS.MIN_COLLATERAL_RATIO) {
             elements.ratioDisplay.classList.add('warning');
        } else if (ratio < CONFIG.LIMITS.MIN_COLLATERAL_RATIO) {
             elements.ratioDisplay.classList.add('danger');
        }
        elements.warningMsg.classList.toggle('hidden', ratio >= CONFIG.LIMITS.MIN_COLLATERAL_RATIO);
    }
    updateMintButtonState();
    calculateMaxMintable();
}

function calculateMaxMintable() {
    const ethAmount = parseFloat(elements.collateralInput.value || '0');
    if (!ethAmount || ethAmount <= 0 || !localState.ethPriceGHS) {
         elements.maxMintableText.textContent = 'Max: 0.00 tGHSX';
        return;
    }
    const collateralValueGHS = ethAmount * localState.ethPriceGHS;
    const maxMintable = collateralValueGHS / (CONFIG.LIMITS.MIN_COLLATERAL_RATIO / 100);
    elements.maxMintableText.textContent = `Max: ${maxMintable.toFixed(2)} tGHSX`;
}

function setPresetAmount(percentage) {
    const maxPossibleDeposit = Math.min(parseFloat(localState.userBalance || '0'), CONFIG.LIMITS.MAX_TRANSACTION_VALUE);
    const amount = maxPossibleDeposit * percentage;
    elements.collateralInput.value = amount.toFixed(4);
    debouncedCalculateRatio();
}

function setMaxCollateral() {
    const amountToSet = Math.min(parseFloat(localState.userBalance || '0'), CONFIG.LIMITS.MAX_TRANSACTION_VALUE);
    elements.collateralInput.value = amountToSet.toFixed(4);
    debouncedCalculateRatio();
}

function setMaxMint() {
    const collateralAmount = parseFloat(elements.collateralInput.value || '0');
    if (collateralAmount > 0 && localState.ethPriceGHS) {
        const maxMintable = (collateralAmount * localState.ethPriceGHS) / (CONFIG.LIMITS.MIN_COLLATERAL_RATIO / 100);
        elements.mintInput.value = maxMintable.toFixed(2);
        debouncedCalculateRatio();
    }
}

function setMaxRepay() {
    elements.repayInput.value = parseFloat(elements.vaultDebt.textContent || '0').toFixed(2);
}

function setMaxWithdraw() {
    elements.withdrawInput.value = parseFloat(elements.vaultCollateral.textContent || '0').toFixed(4);
}

async function showConfirmation(type, details) {
    localState.currentTransaction = { type, details };
    elements.confirmationTitle.textContent = `Confirm ${type} Transaction`;
    elements.modalExchangeRate.textContent = `1 ETH = ${formatCurrency(localState.ethPriceGHS)}`;
    const currentCollateral = parseFloat(elements.vaultCollateral.textContent) || 0;
    const currentDebt = parseFloat(elements.vaultDebt.textContent) || 0;
    const currentRatioText = elements.vaultRatio.textContent;
    let newCollateral, newDebt, newRatio;
    
    let feeInMatic = '0';

    if (type === 'Mint') {
        const { collateral, mint } = details;
        newCollateral = currentCollateral + parseFloat(collateral || 0);
        newDebt = currentDebt + parseFloat(mint || 0);
        feeInMatic = localState.estimatedMintFeeMatic;
        
        elements.modalAction.textContent = "Deposit & Mint";
        elements.modalSummary2Label.textContent = "Deposit ETH:";
        elements.modalSummary2Value.textContent = formatNumber(collateral || 0, 4);
        elements.modalSummary3Label.textContent = "Mint tGHSX:";
        elements.modalSummary3Value.textContent = formatNumber(mint || 0, 2);
        elements.modalReceiveContainer.classList.add('hidden');
        elements.modalRiskWarning.classList.remove('hidden');
        elements.modalRiskWarningText.textContent = "Depositing will change your collateral ratio. Ensure it remains above 150% to avoid liquidation risk.";
    } else if (type === 'Repay') {
        const { repay, withdraw } = details;
        newCollateral = currentCollateral - parseFloat(withdraw || 0);
        newDebt = currentDebt - parseFloat(repay || 0);
        feeInMatic = localState.estimatedRepayFeeMatic;

        elements.modalAction.textContent = "Repay & Withdraw";
        elements.modalSummary2Label.textContent = "Repay tGHSX:";
        elements.modalSummary2Value.textContent = formatNumber(repay || 0, 2);
        elements.modalSummary3Label.textContent = "Withdraw ETH:";
        elements.modalSummary3Value.textContent = formatNumber(withdraw || 0, 4);
        elements.modalReceiveContainer.classList.remove('hidden');
        elements.modalYouReceive.textContent = `~${formatNumber(Math.max(0, parseFloat(withdraw || 0)), 4)} ETH`;
        elements.modalRiskWarning.classList.add('hidden');
    }

    elements.modalNetworkFee.textContent = `~${parseFloat(feeInMatic).toFixed(6)} MATIC`;

    if (newDebt > 0 && newCollateral > 0 && localState.ethPriceGHS > 0) {
        newRatio = (newCollateral * localState.ethPriceGHS / newDebt) * 100;
    } else {
        newRatio = newDebt <= 0 ? Infinity : 0;
    }

    elements.modalCurrentCollateral.textContent = `${formatNumber(currentCollateral, 4)} ETH`;
    elements.modalNewCollateral.textContent = `${formatNumber(newCollateral, 4)} ETH`;
    elements.modalCurrentRatio.textContent = currentRatioText;
    elements.modalNewRatio.textContent = isFinite(newRatio) ? `~${newRatio.toFixed(2)}%` : '∞%';
    
    [elements.modalCurrentRatio, elements.modalNewRatio].forEach(el => {
        const ratio = parseFloat(el.textContent.replace(/[~%∞]/g, ''));
        el.className = 'detail-value'; 
        if (!isFinite(ratio) || ratio > 200) el.classList.add('green');
        else if (ratio >= CONFIG.LIMITS.MIN_COLLATERAL_RATIO) el.classList.add('yellow');
        else el.classList.add('danger');
    });

    elements.confirmationModal.classList.add('active');
}

function closeConfirmation() {
    elements.confirmationModal.classList.remove('active');
    localState.currentTransaction = null;
}

function proceedWithTransaction() {
    if (!localState.currentTransaction) return;
    const { type, details } = localState.currentTransaction; 
    closeConfirmation(); 
    if (type === 'Mint') depositAndMint(details); 
    else if (type === 'Repay') repayAndWithdraw(details); 
}

async function depositAndMint(details) {
    const { collateral, mint } = details;
    if (parseFloat(collateral) < CONFIG.LIMITS.MIN_COLLATERAL_AMOUNT || parseFloat(mint) < CONFIG.LIMITS.MIN_MINT_AMOUNT) {
        return showToast('Collateral or mint amount is too low.', 'error');
    }
    
    elements.mintButton.classList.add('loading');
    elements.mintButtonText.textContent = '';

    try {
        const mintAmountWei = ethers.utils.parseEther(mint);
        const tx = await appState.collateralVaultContract.depositAndMint(mintAmountWei, { value: ethers.utils.parseEther(collateral) });
        showToast('Waiting for blockchain confirmation...', 'info');
        const receipt = await tx.wait();
        
        if (receipt.status === 1) {
            showToast('Deposit and Mint successful!', 'success');
            elements.collateralInput.value = '';
            elements.mintInput.value = '';
            await refreshAllData();
        } else {
            throw new Error('Transaction failed on-chain.');
        }

    } catch (error) {
        console.error('Error in depositAndMint:', error);
        showToast(getErrorMessage(error) || error.message, 'error');
    } finally {
        elements.mintButton.classList.remove('loading');
        updateMintButtonState();
    }
}

async function repayAndWithdraw(details) {
    const { repay, withdraw } = details;
    if (parseFloat(repay || '0') <= 0 && parseFloat(withdraw || '0') <= 0) {
        return showToast('Please enter an amount to repay or withdraw.', 'error');
    }

    elements.repayButton.classList.add('loading');
    elements.repayButton.innerHTML = '';

    try {
        const repayWei = ethers.utils.parseEther(repay || '0');
        const withdrawWei = ethers.utils.parseEther(withdraw || '0');

        if (parseFloat(repay || '0') > 0) {
            showToast('Checking token allowance...', 'info');
            const allowance = await appState.tghsxTokenContract.allowance(appState.userAccount, appState.collateralVaultContract.address);
            if (allowance.lt(repayWei)) {
                showToast('Please approve the vault to use your tGHSX.', 'info');
                const approveTx = await appState.tghsxTokenContract.approve(appState.collateralVaultContract.address, ethers.constants.MaxUint256);
                await approveTx.wait();
                showToast('Approval successful!', 'success');
            }
        }

        const tx = await appState.collateralVaultContract.repayAndWithdraw(repayWei, withdrawWei);
        showToast('Waiting for blockchain confirmation...', 'info');
        const receipt = await tx.wait();
        
        if (receipt.status === 1) {
            showToast('Transaction successful!', 'success');
            elements.repayInput.value = '';
            elements.withdrawInput.value = '';
            await refreshAllData();
        } else {
            throw new Error('Transaction failed on-chain.');
        }
    } catch (error) {
        console.error('Error in repayAndWithdraw:', error);
        showToast(getErrorMessage(error), 'error');
    } finally {
        elements.repayButton.classList.remove('loading');
        elements.repayButton.innerHTML = `<i class="fas fa-exchange-alt"></i> Repay & Withdraw`;
    }
}

function togglePresetButtons(enabled) {
    const buttons = elements.presetButtons.querySelectorAll('.preset-btn');
    buttons.forEach(button => {
        button.disabled = !enabled;
    });
}

function handleProtocolStatusUpdate(event) {
    const { isPaused, error } = event.detail;

    if (error) {
        elements.protocolStatusText.textContent = 'Could not verify protocol status.';
        elements.protocolStatusBanner.classList.remove('hidden');
        return;
    }

    if (isPaused) {
        elements.protocolStatusText.textContent = 'Protocol is currently paused. All actions are temporarily disabled.';
        elements.protocolStatusBanner.classList.remove('hidden');
        elements.mintButton.disabled = true;
        elements.repayButton.disabled = true;
    } else {
        elements.protocolStatusBanner.classList.add('hidden');
    }

    updateMintButtonState();
    elements.repayButton.disabled = isPaused;
}

function handleNetworkConnected() {
    updateNetworkStatus(true);
    refreshAllData();
}

function handleWalletDisconnected() {
    updateNetworkStatus(false);
    resetUI();
}

function setupEventListeners() {
    elements.collateralInput.addEventListener('input', debouncedCalculateRatio);
    elements.mintInput.addEventListener('input', debouncedCalculateRatio);
    elements.repayInput.addEventListener('input', updateFeeEstimates);
    elements.withdrawInput.addEventListener('input', updateFeeEstimates);

    elements.mintButton.addEventListener('click', () => {
        if (appState.isProtocolPaused) {
            return showToast('Action disabled: Protocol is paused.', 'error');
        }
        const details = { collateral: elements.collateralInput.value, mint: elements.mintInput.value };
        if (parseFloat(details.collateral) > 0 && parseFloat(details.mint) > 0) {
            showConfirmation('Mint', details);
        } else {
            showToast('Please enter amounts to deposit and mint.', 'error');
        }
    });

    elements.repayButton.addEventListener('click', () => {
        if (appState.isProtocolPaused) {
            return showToast('Action disabled: Protocol is paused.', 'error');
        }
        const details = { repay: elements.repayInput.value, withdraw: elements.withdrawInput.value };
        if (parseFloat(details.repay) > 0 || parseFloat(details.withdraw) > 0) {
             showConfirmation('Repay', details);
        } else {
            showToast('Please enter an amount to repay or withdraw.', 'error');
        }
    });

    elements.closeConfirmationBtn.addEventListener('click', closeConfirmation);
    elements.cancelConfirmationBtn.addEventListener('click', closeConfirmation);
    elements.proceedTransactionBtn.addEventListener('click', proceedWithTransaction);
    
    elements.tokenSelector.addEventListener('click', () => showToast('Only ETH is supported as collateral currently', 'info'));
    
    elements.presetButtons.addEventListener('click', (e) => {
        if (e.target.classList.contains('preset-btn')) {
            setPresetAmount(parseFloat(e.target.dataset.preset));
        }
    });

    elements.maxCollateralBtn.addEventListener('click', setMaxCollateral);
    elements.maxMintBtn.addEventListener('click', setMaxMint);
    elements.maxRepayBtn.addEventListener('click', setMaxRepay);
    elements.maxWithdrawBtn.addEventListener('click', setMaxWithdraw);
    
    document.addEventListener('networkConnected', handleNetworkConnected);
    document.addEventListener('walletDisconnected', handleWalletDisconnected);
    document.addEventListener('accountChanged', refreshAllData);
    document.addEventListener('protocolStatusUpdated', handleProtocolStatusUpdate);
}

function setupRiskModal() {
    const mainApp = elements.appContent;
    const riskModal = elements.riskModalOverlay;
    const declinedOverlay = elements.riskDeclinedOverlay;

    if (sessionStorage.getItem('riskAccepted') === 'true') {
        riskModal.classList.add('hidden');
        mainApp.classList.remove('hidden');
        return;
    }

    mainApp.classList.add('hidden');
    riskModal.classList.remove('hidden');
    riskModal.classList.add('show');

    elements.riskCheckbox.onchange = () => {
        elements.proceedRiskBtn.disabled = !elements.riskCheckbox.checked;
    };

    elements.proceedRiskBtn.onclick = () => {
        sessionStorage.setItem('riskAccepted', 'true');
        riskModal.classList.remove('show');
        riskModal.classList.add('hidden');
        mainApp.classList.remove('hidden');
        showToast('Welcome to the tGHSX Protocol!', 'success');
    };

    elements.declineRiskBtn.onclick = () => {
        riskModal.classList.remove('show');
        riskModal.classList.add('hidden');
        declinedOverlay.classList.remove('hidden');
        declinedOverlay.classList.add('show');
    };
}

function updateNetworkStatus(connected) {
    elements.networkStatus.classList.toggle('connected', connected);
    elements.networkIndicator.classList.toggle('connected', connected);
    elements.networkName.textContent = connected && appState.networkName ? appState.networkName : 'Not Connected';
}

function initializeApp() {
  setupEventListeners();
  setupRiskModal();
  calculateCollateralRatio();
  updateMintButtonState();
  togglePresetButtons(false);
}

document.addEventListener('DOMContentLoaded', initializeApp);
