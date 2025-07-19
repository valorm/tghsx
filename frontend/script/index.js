/**
 * ==================================================================================
 * New dApp Logic
 *
 * This script powers the redesigned tGHSX dApp interface.
 * ==================================================================================
 */

import { appState, showToast, getErrorMessage, BACKEND_URL, formatAddress } from './shared-wallet.js';

// --- State ---
let localState = {
    ethPrice: 0,
    minCollateralRatio: 1.5,
    liquidationRatio: 1.25, // Assuming a liquidation threshold
    userBalance: '0',
    vaultCollateral: '0',
    vaultDebt: '0',
};

// --- Element Cache ---
const elements = {
    // Top Bar
    ghsPriceStatus: document.getElementById('ghs-price-status').querySelector('span'),
    networkStatus: document.getElementById('network-status'),
    
    // Vault Card
    vaultConnectionStatus: document.getElementById('vault-connection-status'),
    vaultCollateral: document.getElementById('vault-collateral'),
    vaultDebt: document.getElementById('vault-debt'),
    vaultRatio: document.getElementById('vault-ratio'),
    liquidationPrice: document.getElementById('liquidation-price'),
    riskBar: document.getElementById('risk-bar'),
    repayInput: document.getElementById('repay-input'),
    withdrawInput: document.getElementById('withdraw-input'),
    repayWithdrawBtn: document.getElementById('repay-withdraw-btn'),
    
    // Mint Card
    ethPrice: document.getElementById('eth-price'),
    userBalance: document.getElementById('user-balance'),
    collateralAmountInput: document.getElementById('collateral-amount-input'),
    mintAmountInput: document.getElementById('mint-amount-input'),
    resultingRatio: document.getElementById('resulting-ratio'),
    exchangeRate: document.getElementById('exchange-rate'),
    mainActionBtn: document.getElementById('main-action-btn'),
};

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    if (appState.isCorrectNetwork) initializePage();
    else resetUI();
});

document.addEventListener('networkConnected', initializePage);
document.addEventListener('walletDisconnected', resetUI);

function initializePage() {
    setupEventListeners();
    startAutoRefresh();
}

function setupEventListeners() {
    // Add listeners for MAX buttons, percentage buttons, and main action buttons
    document.querySelectorAll('.max-btn').forEach(btn => btn.addEventListener('click', handleMaxButtonClick));
    document.querySelectorAll('.percent-btn').forEach(btn => btn.addEventListener('click', handlePercentButtonClick));
    
    elements.repayWithdrawBtn.addEventListener('click', () => handleTransaction('repayAndWithdraw'));
    elements.mainActionBtn.addEventListener('click', handleMainActionClick);
    
    [elements.collateralAmountInput, elements.mintAmountInput, elements.repayInput, elements.withdrawInput].forEach(input => {
        input.addEventListener('input', updateCalculations);
    });
}

// --- Data Fetching & Refreshing ---
async function refreshAllData() {
    if (!appState.isCorrectNetwork || !appState.userAccount) return;
    
    await Promise.all([
        fetchOraclePrice(),
        fetchVaultData(),
        fetchUserBalance(),
    ]);
    updateUI();
}

function startAutoRefresh() {
    refreshAllData();
    setInterval(refreshAllData, 30000); // Refresh every 30 seconds
}

async function fetchOraclePrice() {
    // In a real app, this would come from the backend/oracle service
    localState.ethPrice = 3000; // Using a mock price for now
}

async function fetchVaultData() {
    const position = await appState.collateralVaultContract.getUserPosition(appState.userAccount, appState.supportedCollaterals[0].address); // Assuming ETH is the first collateral
    localState.vaultCollateral = ethers.utils.formatEther(position.collateralAmount);
    localState.vaultDebt = ethers.utils.formatUnits(position.mintedAmount, 6);
}

async function fetchUserBalance() {
    const balance = await appState.signer.getBalance();
    localState.userBalance = ethers.utils.formatEther(balance);
}

// --- UI Updates ---
function updateUI() {
    updateNetworkStatus();
    updateTopBar();
    updateVaultCard();
    updateMintCard();
    updateCalculations();
}

function resetUI() {
    // Reset all values to their default disconnected state
    Object.values(elements).forEach(el => {
        if(el.id.includes('input')) el.value = '';
    });
    elements.vaultCollateral.textContent = '0.00';
    elements.vaultDebt.textContent = '0.00';
    elements.vaultRatio.textContent = '--%';
    elements.liquidationPrice.textContent = '-- GH₵';
    elements.riskBar.style.width = '0%';
    elements.userBalance.textContent = '0.00';
    elements.mainActionBtn.innerHTML = '<i class="fas fa-wallet"></i> Connect Wallet First';
    elements.mainActionBtn.disabled = false;
    elements.vaultConnectionStatus.textContent = 'Not Connected';
    elements.vaultConnectionStatus.className = 'status-badge disconnected';
    updateNetworkStatus();
}

function updateNetworkStatus() {
    const statusEl = elements.networkStatus;
    if (appState.isCorrectNetwork && appState.userAccount) {
        statusEl.classList.add('connected');
        statusEl.querySelector('span').textContent = `Network: ${appState.networkName}`;
    } else {
        statusEl.classList.remove('connected');
        statusEl.querySelector('span').textContent = 'Network: Not Connected';
    }
}

function updateTopBar() {
    elements.ghsPriceStatus.textContent = `GH₵ ${localState.ethPrice.toFixed(2)}`;
}

function updateVaultCard() {
    elements.vaultConnectionStatus.textContent = 'Connected';
    elements.vaultConnectionStatus.className = 'status-badge connected';
    elements.vaultCollateral.textContent = parseFloat(localState.vaultCollateral).toFixed(4);
    elements.vaultDebt.textContent = parseFloat(localState.vaultDebt).toFixed(2);
    
    const { ratio, liquidationPrice, riskPercent } = calculateVaultMetrics(localState.vaultCollateral, localState.vaultDebt);
    
    elements.vaultRatio.textContent = isFinite(ratio) ? `${ratio.toFixed(2)}%` : '--%';
    elements.liquidationPrice.textContent = isFinite(liquidationPrice) ? `${liquidationPrice.toFixed(2)} GH₵` : '-- GH₵';
    elements.riskBar.style.width = `${riskPercent}%`;
}

function updateMintCard() {
    elements.ethPrice.textContent = `GH₵ ${localState.ethPrice.toFixed(2)}`;
    elements.userBalance.textContent = parseFloat(localState.userBalance).toFixed(4);
    elements.exchangeRate.textContent = `1 ETH = GH₵ ${localState.ethPrice.toFixed(2)}`;
    elements.mainActionBtn.innerHTML = '<i class="fas fa-coins"></i> Mint tGHSX';
}

function updateCalculations() {
    const collateralToAdd = parseFloat(elements.collateralAmountInput.value) || 0;
    const debtToMint = parseFloat(elements.mintAmountInput.value) || 0;

    const totalCollateral = parseFloat(localState.vaultCollateral) + collateralToAdd;
    const totalDebt = parseFloat(localState.vaultDebt) + debtToMint;

    const { ratio } = calculateVaultMetrics(totalCollateral, totalDebt);
    elements.resultingRatio.textContent = isFinite(ratio) ? `${ratio.toFixed(2)}%` : '--%';
}

// --- Event Handlers ---
function handleMaxButtonClick(event) {
    const inputId = event.target.dataset.input;
    const inputEl = document.getElementById(inputId);
    
    if (inputId === 'collateral-amount-input') {
        inputEl.value = localState.userBalance;
    } else if (inputId === 'repay-input') {
        inputEl.value = localState.vaultDebt;
    }
    // Add logic for other max buttons if needed
    updateCalculations();
}

function handlePercentButtonClick(event) {
    const percent = parseFloat(event.target.dataset.value);
    const collateralInput = elements.collateralAmountInput;
    collateralInput.value = (parseFloat(localState.userBalance) * percent).toFixed(6);
    updateCalculations();
}

function handleMainActionClick() {
    if (!appState.userAccount) {
        connectWallet();
    } else {
        handleTransaction('mint');
    }
}

// --- Transaction Logic ---
async function handleTransaction(type) {
    if (!appState.signer) return showToast('Please connect your wallet.', 'error');

    let txFunction, args;
    const collateralAmount = elements.collateralAmountInput.value;
    const mintAmount = elements.mintAmountInput.value;
    const repayAmount = elements.repayInput.value;
    const withdrawAmount = elements.withdrawInput.value;

    try {
        if (type === 'mint') {
            txFunction = appState.collateralVaultContract.depositAndMint; // Assuming a combined function
            args = [ethers.utils.parseUnits(mintAmount, 6), { value: ethers.utils.parseEther(collateralAmount) }];
        } else if (type === 'repayAndWithdraw') {
            txFunction = appState.collateralVaultContract.repayAndWithdraw;
            args = [ethers.utils.parseUnits(repayAmount, 6), ethers.utils.parseEther(withdrawAmount)];
            // Need to approve tGHSX spending first
            await approveTghsx(repayAmount);
        } else {
            return;
        }

        showToast('Sending transaction...', 'info');
        const tx = await txFunction(...args);
        await tx.wait();
        showToast('Transaction successful!', 'success');
        await refreshAllData();

    } catch (error) {
        showToast(getErrorMessage(error), 'error');
    }
}

async function approveTghsx(amount) {
    const amountWei = ethers.utils.parseUnits(amount, 6);
    const allowance = await appState.tghsxTokenContract.allowance(appState.userAccount, appState.collateralVaultContract.address);
    if (allowance.lt(amountWei)) {
        showToast('Approving tGHSX spending...', 'info');
        const approveTx = await appState.tghsxTokenContract.approve(appState.collateralVaultContract.address, ethers.constants.MaxUint256);
        await approveTx.wait();
    }
}

// --- Calculations ---
function calculateVaultMetrics(collateral, debt) {
    const collateralValue = parseFloat(collateral) * localState.ethPrice;
    const debtValue = parseFloat(debt);
    
    const ratio = debtValue > 0 ? (collateralValue / debtValue) * 100 : Infinity;
    const liquidationPrice = debtValue > 0 ? (debtValue * localState.minCollateralRatio) / parseFloat(collateral) : 0;
    
    // Risk: 0% at 300% ratio, 100% at 150% (min) ratio
    const riskPercent = Math.max(0, Math.min(100, (300 - ratio) / (300 - (localState.minCollateralRatio * 100)) * 100));
    
    return { ratio, liquidationPrice, riskPercent };
}
