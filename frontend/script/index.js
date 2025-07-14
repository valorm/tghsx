/**
 * ==================================================================================
 * Main dApp Logic (index.js)
 *
 * This script handles all core functionalities of the tGHSX minting and vault
 * management page. It is updated to match the latest contract and backend logic.
 * ==================================================================================
 */

import { appState, showToast, getErrorMessage, BACKEND_URL, formatAddress } from './shared-wallet.js';

// --- Configuration & State ---
const CONFIG = {
    UI: { DEBOUNCE_DELAY: 300, POLLING_INTERVAL: 5000 },
    // Fallback gas units in case estimation fails
    GAS_UNITS: { DEPOSIT: 120000, MINT: 150000, BURN: 100000, WITHDRAW: 100000 },
};

let localState = {
    oraclePriceUSD: 0, // Price of the selected collateral in USD
    minCollateralRatio: 1.5, // Default, will be fetched from contract
    userCollateralBalance: '0', // User's balance of the selected collateral token
    selectedCollateral: { address: '', symbol: 'ETH', decimals: 18 }, // Default to ETH
    isPolling: false,
};

// A map to cache ABI and metadata for collateral tokens
const tokenInfoCache = new Map();

// --- Element Cache ---
const elements = {
    // ... (cache all your DOM elements here for performance)
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
    // ... add all other elements
};

// --- Initialization ---

document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    if (appState.isCorrectNetwork) {
        initializePage();
    }
});

document.addEventListener('networkConnected', initializePage);
document.addEventListener('walletDisconnected', resetUI);

async function initializePage() {
    await populateCollateralSelector();
    await fetchConstantData();
    await refreshAllData();
    startAutoRefresh();
}

function setupEventListeners() {
    elements.collateralSelector.addEventListener('change', handleCollateralChange);
    
    // Deposit and Mint actions
    elements.depositBtn.addEventListener('click', () => handleTransaction('deposit'));
    elements.mintBtn.addEventListener('click', () => handleTransaction('mint'));

    // Repay and Withdraw actions
    elements.burnBtn.addEventListener('click', () => handleTransaction('burn'));
    elements.withdrawBtn.addEventListener('click', () => handleTransaction('withdraw'));

    // ... other event listeners for max buttons, inputs etc.
}

// --- Data Fetching & State Updates ---

async function refreshAllData() {
    if (!appState.userAccount || !appState.isCorrectNetwork) return;
    
    await Promise.allSettled([
        loadUserVaultData(),
        loadUserBalance(),
        loadOraclePrice(),
    ]);
}

function startAutoRefresh() {
    if (localState.autoRefreshInterval) clearInterval(localState.autoRefreshInterval);
    localState.autoRefreshInterval = setInterval(refreshAllData, 30000); // Refresh every 30 seconds
}

async function populateCollateralSelector() {
    const selector = elements.collateralSelector;
    selector.innerHTML = ''; // Clear previous options
    
    for (const address of appState.supportedCollaterals) {
        const info = await getTokenInfo(address);
        const option = document.createElement('option');
        option.value = address;
        option.textContent = info.symbol;
        option.dataset.decimals = info.decimals;
        selector.appendChild(option);
    }
    
    // Set the initial selected collateral
    if (appState.supportedCollaterals.length > 0) {
        const firstCollateralAddress = appState.supportedCollaterals[0];
        const firstCollateralInfo = await getTokenInfo(firstCollateralAddress);
        localState.selectedCollateral = {
            address: firstCollateralAddress,
            symbol: firstCollateralInfo.symbol,
            decimals: firstCollateralInfo.decimals,
        };
    }
}

async function handleCollateralChange(event) {
    const selectedOption = event.target.options[event.target.selectedIndex];
    localState.selectedCollateral = {
        address: selectedOption.value,
        symbol: selectedOption.textContent,
        decimals: parseInt(selectedOption.dataset.decimals, 10),
    };
    await refreshAllData(); // Refresh all data for the new collateral
}

async function fetchConstantData() {
    const ratio = await appState.collateralVaultContract.MIN_COLLATERAL_RATIO();
    const decimals = await appState.tghsxTokenContract.decimals();
    localState.minCollateralRatio = parseFloat(ethers.utils.formatUnits(ratio, decimals));
}

async function loadUserVaultData() {
    if (!localState.selectedCollateral.address) return;

    const position = await appState.collateralVaultContract.getUserPosition(
        appState.userAccount,
        localState.selectedCollateral.address
    );

    const collateralDecimals = localState.selectedCollateral.decimals;
    const tghsxDecimals = await appState.tghsxTokenContract.decimals();
    
    const collateralAmount = ethers.utils.formatUnits(position[0], collateralDecimals);
    const mintedAmount = ethers.utils.formatUnits(position[1], tghsxDecimals);
    const collateralRatio = parseFloat(ethers.utils.formatUnits(position[3], tghsxDecimals)) * 100;

    elements.vaultCollateral.textContent = `${parseFloat(collateralAmount).toFixed(4)} ${localState.selectedCollateral.symbol}`;
    elements.vaultDebt.textContent = `${parseFloat(mintedAmount).toFixed(2)} tGHSX`;
    elements.vaultRatio.textContent = isFinite(collateralRatio) ? `${collateralRatio.toFixed(2)}%` : '∞%';
    updateHealthBadge(collateralRatio);
}

async function loadUserBalance() {
    const collateralAddress = localState.selectedCollateral.address;
    const tokenContract = new ethers.Contract(collateralAddress, ["function balanceOf(address) view returns (uint256)"], appState.provider);
    const balance = await tokenContract.balanceOf(appState.userAccount);
    localState.userCollateralBalance = ethers.utils.formatUnits(balance, localState.selectedCollateral.decimals);
    elements.userBalance.textContent = `Balance: ${parseFloat(localState.userCollateralBalance).toFixed(4)} ${localState.selectedCollateral.symbol}`;
}

async function loadOraclePrice() {
    // This is a placeholder. In a real app, you'd fetch the price for the selected collateral.
    // For now, we'll use a fixed price.
    localState.oraclePriceUSD = 3000; // Example: 1 ETH = $3000
}

// --- Transaction Logic ---

async function handleTransaction(type) {
    const collateralAddress = localState.selectedCollateral.address;
    let amount, txFunction, args;

    try {
        switch (type) {
            case 'deposit':
                amount = elements.collateralInput.value;
                if (!amount || parseFloat(amount) <= 0) throw new Error("Invalid deposit amount.");
                
                // First, approve the vault to spend the collateral token
                await approveToken(collateralAddress, amount);
                
                txFunction = appState.collateralVaultContract.depositCollateral;
                args = [collateralAddress, ethers.utils.parseUnits(amount, localState.selectedCollateral.decimals)];
                break;

            case 'mint':
                amount = elements.mintInput.value;
                if (!amount || parseFloat(amount) <= 0) throw new Error("Invalid mint amount.");
                
                // The new flow: request from backend, then user signs
                await submitMintRequest(collateralAddress, amount);
                return; // Exit here, minting is a multi-step process

            case 'burn':
                amount = elements.repayInput.value;
                if (!amount || parseFloat(amount) <= 0) throw new Error("Invalid repay amount.");
                
                // Approve the vault to burn user's tGHSX
                await approveToken(appState.tghsxTokenContract.address, amount, true);
                
                txFunction = appState.collateralVaultContract.burnTokens;
                args = [collateralAddress, ethers.utils.parseUnits(amount, await appState.tghsxTokenContract.decimals())];
                break;

            case 'withdraw':
                amount = elements.withdrawInput.value;
                if (!amount || parseFloat(amount) <= 0) throw new Error("Invalid withdraw amount.");
                txFunction = appState.collateralVaultContract.withdrawCollateral;
                args = [collateralAddress, ethers.utils.parseUnits(amount, localState.selectedCollateral.decimals)];
                break;
            
            default:
                return;
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

async function approveToken(tokenAddress, amount, isTghsx = false) {
    const tokenContract = new ethers.Contract(tokenAddress, ["function approve(address, uint256) returns (bool)", "function allowance(address, address) view returns (uint256)"], appState.signer);
    const decimals = isTghsx ? await appState.tghsxTokenContract.decimals() : localState.selectedCollateral.decimals;
    const amountWei = ethers.utils.parseUnits(amount, decimals);
    
    const allowance = await tokenContract.allowance(appState.userAccount, appState.collateralVaultContract.address);
    if (allowance.lt(amountWei)) {
        showToast(`Approving vault to use your ${isTghsx ? 'tGHSX' : localState.selectedCollateral.symbol}...`, 'info');
        const approveTx = await tokenContract.approve(appState.collateralVaultContract.address, ethers.constants.MaxUint256);
        await approveTx.wait();
        showToast('Approval successful!', 'success');
    }
}

async function submitMintRequest(collateralAddress, mintAmount) {
    const token = localStorage.getItem('accessToken');
    if (!token) return showToast('You must be logged in.', 'error');

    showToast('Submitting mint request for admin approval...', 'info');
    try {
        const response = await fetch(`${BACKEND_URL}/mint/request`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({
                collateral_address: collateralAddress,
                collateral_amount: '0', // The collateral is already deposited, this is just for the request record
                mint_amount: mintAmount
            })
        });

        if (!response.ok) throw new Error((await response.json()).detail);
        
        const { request_id } = await response.json();
        showToast('Request submitted! Waiting for approval...', 'info');
        pollMintRequestStatus(request_id, collateralAddress, mintAmount);

    } catch (error) {
        showToast(getErrorMessage(error), 'error');
    }
}

function pollMintRequestStatus(requestId, collateralAddress, mintAmount) {
    if (localState.isPolling) return;
    localState.isPolling = true;

    const intervalId = setInterval(async () => {
        const token = localStorage.getItem('accessToken');
        if (!token) {
            clearInterval(intervalId);
            localState.isPolling = false;
            return;
        }
        try {
            const res = await fetch(`${BACKEND_URL}/mint/request/${requestId}`, { headers: { 'Authorization': `Bearer ${token}` } });
            const data = await res.json();

            if (data.status === 'approved') {
                clearInterval(intervalId);
                localState.isPolling = false;
                showToast('Request approved! Please confirm the mint transaction.', 'success');
                // Now, trigger the actual on-chain mint transaction
                await executeMint(collateralAddress, mintAmount);
            } else if (['declined', 'failed'].includes(data.status)) {
                clearInterval(intervalId);
                localState.isPolling = false;
                showToast(`Mint request was ${data.status}.`, 'error');
            }
        } catch (error) {
            clearInterval(intervalId);
            localState.isPolling = false;
        }
    }, CONFIG.UI.POLLING_INTERVAL);
}

async function executeMint(collateralAddress, mintAmount) {
    try {
        const tghsxDecimals = await appState.tghsxTokenContract.decimals();
        const amountWei = ethers.utils.parseUnits(mintAmount, tghsxDecimals);
        const tx = await appState.collateralVaultContract.mintTokens(collateralAddress, amountWei);
        showToast('Confirming mint transaction...', 'info');
        await tx.wait();
        showToast('tGHSX minted successfully!', 'success');
        await refreshAllData();
    } catch (error) {
        showToast(getErrorMessage(error), 'error');
    }
}


// --- UI Helpers ---

function updateHealthBadge(ratio) {
    const badge = elements.vaultHealthBadge;
    badge.className = 'collateral-ratio-badge';
    let status = 'No Debt';
    let className = '';

    if (isFinite(ratio) && ratio > 0) {
        if (ratio > 2.0) { status = 'Healthy'; }
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
    // Reset all input fields and display areas
    Object.values(elements).forEach(el => {
        if (el.tagName === 'INPUT') el.value = '';
    });
    elements.vaultCollateral.textContent = '0.00';
    elements.vaultDebt.textContent = '0.00';
    elements.vaultRatio.textContent = '--%';
    elements.userBalance.textContent = 'Balance: 0.00';
    updateHealthBadge(Infinity);
}

async function getTokenInfo(address) {
    if (tokenInfoCache.has(address)) {
        return tokenInfoCache.get(address);
    }
    try {
        const contract = new ethers.Contract(address, ["function symbol() view returns (string)", "function decimals() view returns (uint8)"], appState.provider);
        const [symbol, decimals] = await Promise.all([contract.symbol(), contract.decimals()]);
        const info = { symbol, decimals };
        tokenInfoCache.set(address, info);
        return info;
    } catch (e) {
        console.warn(`Could not fetch info for token ${address}. Using fallback.`);
        return { symbol: formatAddress(address), decimals: 18 }; // Fallback
    }
}
