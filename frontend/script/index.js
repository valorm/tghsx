/**
 * ==================================================================================
 * Main dApp Logic (index.js)
 *
 * This script handles all core functionalities of the tGHSX minting and vault
 * management page. It is updated to match the latest multi-collateral contract
 * and the secure, two-step backend minting approval process.
 * ==================================================================================
 */

import { appState, showToast, getErrorMessage, BACKEND_URL, formatAddress } from './shared-wallet.js';

// --- State ---
let localState = {
    minCollateralRatio: 1.5, // Default, will be fetched from contract
    selectedCollateral: { address: '', symbol: '', decimals: 18 },
    isPolling: false,
    pollingIntervalId: null,
};

// --- Element Cache ---
const elements = {
    collateralSelector: document.getElementById('collateralSelector'),
    collateralInput: document.getElementById('collateralInput'),
    mintInput: document.getElementById('mintInput'),
    repayInput: document.getElementById('repayInput'),
    withdrawInput: document.getElementById('withdrawInput'),
    depositBtn: document.getElementById('depositBtn'),
    mintBtn: document.getElementById('mintBtn'),
    burnBtn: document.getElementById('burnBtn'),
    withdrawBtn: document.getElementById('withdrawBtn'),
    vaultCollateral: document.getElementById('vaultCollateral'),
    vaultDebt: document.getElementById('vaultDebt'),
    vaultRatio: document.getElementById('vaultRatio'),
    vaultHealthBadge: document.getElementById('vaultHealthBadge'),
    userBalance: document.getElementById('userBalance'),
    mintRequestsList: document.getElementById('mintRequestsList'),
};

// --- Initialization ---

document.addEventListener('DOMContentLoaded', () => {
    if (appState.isCorrectNetwork) {
        initializePage();
    }
});

document.addEventListener('networkConnected', initializePage);
document.addEventListener('walletDisconnected', resetUI);

async function initializePage() {
    if (!appState.collateralVaultContract) {
        console.warn("Initialization skipped: Contracts not ready.");
        return;
    }
    setupEventListeners();
    await populateCollateralSelector();
    await fetchConstantData();
    await refreshAllData();
    startAutoRefresh();
}

function setupEventListeners() {
    elements.collateralSelector.addEventListener('change', handleCollateralChange);
    elements.depositBtn.addEventListener('click', () => handleTransaction('deposit'));
    elements.mintBtn.addEventListener('click', () => handleTransaction('requestMint'));
    elements.burnBtn.addEventListener('click', () => handleTransaction('burn'));
    elements.withdrawBtn.addEventListener('click', () => handleTransaction('withdraw'));
    // Listener for executing an approved mint request
    elements.mintRequestsList.addEventListener('click', (e) => {
        if (e.target.classList.contains('execute-mint-btn')) {
            const { collateralAddress, mintAmount } = e.target.dataset;
            handleTransaction('executeMint', { collateralAddress, mintAmount });
        }
    });
}

// --- Data Fetching & State Updates ---

async function refreshAllData() {
    if (!appState.userAccount || !appState.isCorrectNetwork || !localState.selectedCollateral.address) return;
    
    await Promise.allSettled([
        loadUserVaultData(),
        loadUserBalance(),
        fetchPendingMintRequests(), // Fetch user's pending/approved requests
    ]);
}

function startAutoRefresh() {
    if (localState.autoRefreshInterval) clearInterval(localState.autoRefreshInterval);
    localState.autoRefreshInterval = setInterval(refreshAllData, 30000);
}

async function populateCollateralSelector() {
    const selector = elements.collateralSelector;
    selector.innerHTML = '';
    if (appState.supportedCollaterals.length === 0) {
        selector.innerHTML = '<option>No collateral available</option>';
        return;
    }
    
    appState.supportedCollaterals.forEach(token => {
        const option = document.createElement('option');
        option.value = token.address;
        option.textContent = token.symbol;
        option.dataset.decimals = token.decimals;
        selector.appendChild(option);
    });

    // Trigger change to load data for the default selected collateral
    selector.dispatchEvent(new Event('change'));
}

async function handleCollateralChange(event) {
    const selectedOption = event.target.options[event.target.selectedIndex];
    localState.selectedCollateral = {
        address: selectedOption.value,
        symbol: selectedOption.textContent,
        decimals: parseInt(selectedOption.dataset.decimals, 10),
    };
    await refreshAllData();
}

async function fetchConstantData() {
    const ratio = await appState.collateralVaultContract.MIN_COLLATERAL_RATIO();
    localState.minCollateralRatio = parseFloat(ethers.utils.formatUnits(ratio, 6)); // Precision is 10^6
}

async function loadUserVaultData() {
    const position = await appState.collateralVaultContract.getUserPosition(
        appState.userAccount,
        localState.selectedCollateral.address
    );

    const collateralAmount = ethers.utils.formatUnits(position.collateralAmount, localState.selectedCollateral.decimals);
    const mintedAmount = ethers.utils.formatUnits(position.mintedAmount, 6); // tGHSX has 6 decimals
    const collateralRatio = parseFloat(ethers.utils.formatUnits(position.collateralRatio, 6)) * 100;

    elements.vaultCollateral.textContent = `${parseFloat(collateralAmount).toFixed(4)} ${localState.selectedCollateral.symbol}`;
    elements.vaultDebt.textContent = `${parseFloat(mintedAmount).toFixed(2)} tGHSX`;
    elements.vaultRatio.textContent = isFinite(collateralRatio) ? `${collateralRatio.toFixed(2)}%` : '∞%';
    updateHealthBadge(collateralRatio);
}

async function loadUserBalance() {
    const tokenContract = new ethers.Contract(localState.selectedCollateral.address, appState.abis.erc20, appState.provider);
    const balance = await tokenContract.balanceOf(appState.userAccount);
    const formattedBalance = ethers.utils.formatUnits(balance, localState.selectedCollateral.decimals);
    elements.userBalance.textContent = `Balance: ${parseFloat(formattedBalance).toFixed(4)} ${localState.selectedCollateral.symbol}`;
}

// --- Transaction Logic ---

async function handleTransaction(type, params = {}) {
    if (!appState.signer) return showToast('Please connect your wallet.', 'error');
    if (appState.isProtocolPaused) return showToast('Protocol is currently paused.', 'error');

    let amount, txFunction, args;
    const { collateralAddress, mintAmount } = params;

    try {
        switch (type) {
            case 'deposit':
                amount = elements.collateralInput.value;
                if (!amount || parseFloat(amount) <= 0) throw new Error("Invalid deposit amount.");
                await approveToken(localState.selectedCollateral.address, amount);
                txFunction = appState.collateralVaultContract.depositCollateral;
                args = [localState.selectedCollateral.address, ethers.utils.parseUnits(amount, localState.selectedCollateral.decimals)];
                break;

            case 'requestMint':
                amount = elements.mintInput.value;
                if (!amount || parseFloat(amount) <= 0) throw new Error("Invalid mint amount.");
                await submitMintRequest(localState.selectedCollateral.address, amount);
                return; // This is an off-chain action, so we exit here.

            case 'executeMint':
                if (!collateralAddress || !mintAmount) throw new Error("Missing parameters for mint execution.");
                txFunction = appState.collateralVaultContract.mintTokens;
                args = [collateralAddress, ethers.utils.parseUnits(mintAmount, 6)];
                break;

            case 'burn':
                amount = elements.repayInput.value;
                if (!amount || parseFloat(amount) <= 0) throw new Error("Invalid repay amount.");
                await approveToken(appState.tghsxTokenContract.address, amount);
                txFunction = appState.collateralVaultContract.burnTokens;
                args = [localState.selectedCollateral.address, ethers.utils.parseUnits(amount, 6)];
                break;

            case 'withdraw':
                amount = elements.withdrawInput.value;
                if (!amount || parseFloat(amount) <= 0) throw new Error("Invalid withdraw amount.");
                txFunction = appState.collateralVaultContract.withdrawCollateral;
                args = [localState.selectedCollateral.address, ethers.utils.parseUnits(amount, localState.selectedCollateral.decimals)];
                break;
            
            default: return;
        }

        showToast(`Sending ${type} transaction...`, 'info');
        const tx = await txFunction(...args);
        await tx.wait();
        showToast(`${type.charAt(0).toUpperCase() + type.slice(1)} successful!`, 'success');
        await refreshAllData();

    } catch (error) {
        showToast(getErrorMessage(error), 'error');
    }
}

async function approveToken(tokenAddress, amount) {
    const tokenContract = new ethers.Contract(tokenAddress, appState.abis.erc20, appState.signer);
    const tokenInfo = appState.supportedCollaterals.find(t => t.address === tokenAddress) || { decimals: 6 }; // Default to 6 for tGHSX
    const amountWei = ethers.utils.parseUnits(amount, tokenInfo.decimals);
    
    const allowance = await tokenContract.allowance(appState.userAccount, appState.collateralVaultContract.address);
    if (allowance.lt(amountWei)) {
        showToast(`Requesting approval to use your tokens...`, 'info');
        const approveTx = await tokenContract.approve(appState.collateralVaultContract.address, ethers.constants.MaxUint256);
        await approveTx.wait();
        showToast('Approval successful!', 'success');
    }
}

// --- NEW: Refactored Minting Flow ---

async function submitMintRequest(collateralAddress, mintAmount) {
    const token = localStorage.getItem('accessToken');
    if (!token) return showToast('You must be logged in to request a mint.', 'error');

    showToast('Submitting mint request for admin approval...', 'info');
    try {
        const response = await fetch(`${BACKEND_URL}/mint/request`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({
                collateral_address: collateralAddress,
                mint_amount: mintAmount
            })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.detail);
        
        showToast('Request submitted! It will appear below once approved.', 'success');
        elements.mintInput.value = ''; // Clear input on success
        await refreshAllData();

    } catch (error) {
        showToast(getErrorMessage(error), 'error');
    }
}

async function fetchPendingMintRequests() {
    const token = localStorage.getItem('accessToken');
    if (!token) return;

    try {
        // This endpoint needs to exist on the backend, returning requests for the current user.
        // Let's assume a new endpoint: /mint/my-requests
        const response = await fetch(`${BACKEND_URL}/mint/my-requests`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) return; // Fail silently if endpoint doesn't exist yet
        
        const requests = await response.json();
        renderMintRequests(requests);

    } catch (error) {
        console.warn("Could not fetch mint requests:", error);
    }
}

function renderMintRequests(requests) {
    elements.mintRequestsList.innerHTML = '';
    const approvedRequests = requests.filter(r => r.status === 'approved');

    if (approvedRequests.length === 0) {
        elements.mintRequestsList.innerHTML = '<li class="no-requests">No approved mint requests found.</li>';
        return;
    }

    approvedRequests.forEach(req => {
        const li = document.createElement('li');
        li.className = 'mint-request-item';
        li.innerHTML = `
            <span>Mint ${req.mint_amount} tGHSX</span>
            <button class="btn execute-mint-btn" 
                    data-collateral-address="${req.collateral_address}" 
                    data-mint-amount="${req.mint_amount}">
                Execute
            </button>
        `;
        elements.mintRequestsList.appendChild(li);
    });
}

// --- UI Helpers ---

function updateHealthBadge(ratio) {
    const badge = elements.vaultHealthBadge;
    badge.className = 'collateral-ratio-badge';
    let status = 'No Debt';
    let className = '';

    if (isFinite(ratio) && ratio > 0) {
        if (ratio > localState.minCollateralRatio * 1.5) { status = 'Healthy'; }
        else if (ratio >= localState.minCollateralRatio) { status = 'Moderate'; className = 'warning'; }
        else { status = 'At Risk'; className = 'danger'; }
    } else if (parseFloat(elements.vaultDebt.textContent) > 0) {
        status = 'At Risk';
        className = 'danger';
    }

    badge.textContent = status;
    if (className) badge.classList.add(className);
}

function resetUI() {
    Object.values(elements).forEach(el => {
        if (el && el.tagName === 'INPUT') el.value = '';
    });
    if(elements.vaultCollateral) elements.vaultCollateral.textContent = '0.00';
    if(elements.vaultDebt) elements.vaultDebt.textContent = '0.00';
    if(elements.vaultRatio) elements.vaultRatio.textContent = '--%';
    if(elements.userBalance) elements.userBalance.textContent = 'Balance: 0.00';
    if(elements.mintRequestsList) elements.mintRequestsList.innerHTML = '';
    updateHealthBadge(Infinity);
}
