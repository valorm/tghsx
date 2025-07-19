/**
 * ==================================================================================
 * Liquidations Page Logic (liquidations.js)
 *
 * Fetches and displays vaults eligible for liquidation and allows users to
 * initiate liquidation transactions. Updated for the multi-collateral contract.
 * ==================================================================================
 */

import { appState, showToast, getErrorMessage, formatAddress, BACKEND_URL } from './shared-wallet.js';

const elements = {
    tableBody: document.getElementById('liquidationTableBody'),
    loadingState: document.getElementById('loadingState'),
    emptyState: document.getElementById('emptyState'),
    modal: document.getElementById('liquidationModal'),
    modalVaultOwner: document.getElementById('modalVaultOwner'),
    modalRepayAmount: document.getElementById('modalRepayAmount'),
    modalReceiveCollateral: document.getElementById('modalReceiveCollateral'),
    modalConfirmBtn: document.getElementById('modalConfirmBtn'),
    modalCancelBtn: document.getElementById('modalCancelBtn'),
};

let currentLiquidationTarget = null;

async function fetchAndRenderRiskyVaults() {
    elements.loadingState.classList.remove('hidden');
    elements.emptyState.classList.add('hidden');
    elements.tableBody.innerHTML = '';

    try {
        const token = localStorage.getItem('accessToken');
        if (!token) throw new Error('Please log in to view liquidations.');

        const response = await fetch(`${BACKEND_URL}/liquidations/at-risk`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) throw new Error((await response.json()).detail || 'Failed to fetch at-risk vaults.');
        
        const vaults = await response.json();
        if (vaults.length === 0) {
            elements.emptyState.classList.remove('hidden');
        } else {
            await renderVaults(vaults);
        }

    } catch (error) {
        showToast(error.message, 'error');
        elements.emptyState.classList.remove('hidden');
    } finally {
        elements.loadingState.classList.add('hidden');
    }
}

async function renderVaults(vaults) {
    let html = '';
    for (const vault of vaults) {
        // FIX: Look up collateral info from appState to get symbol and decimals
        const collateralInfo = appState.supportedCollaterals.find(c => c.address.toLowerCase() === vault.collateral_address.toLowerCase());
        const symbol = collateralInfo ? collateralInfo.symbol : 'UNKNOWN';
        const collateralDecimals = collateralInfo ? collateralInfo.decimals : 18;

        // FIX: Format amounts correctly using their specific decimals
        const collateralAmount = ethers.utils.formatUnits(vault.collateral_amount, collateralDecimals);
        const debtAmount = ethers.utils.formatUnits(vault.minted_amount, 6); // tGHSX has 6 decimals
        const ratio = parseFloat(vault.collateralization_ratio); // Backend now sends formatted ratio

        html += `
            <tr>
                <td data-label="Vault Owner"><a href="https://amoy.polygonscan.com/address/${vault.wallet_address}" target="_blank" class="address-link">${formatAddress(vault.wallet_address)}</a></td>
                <td data-label="Collateral">${parseFloat(collateralAmount).toFixed(4)} ${symbol}</td>
                <td data-label="Debt">${parseFloat(debtAmount).toFixed(2)} tGHSX</td>
                <td data-label="Collateral Ratio"><span class="ratio-danger">${ratio.toFixed(2)}%</span></td>
                <td data-label="Action">
                    <button class="liquidate-btn" 
                        data-user="${vault.wallet_address}" 
                        data-debt="${vault.minted_amount}" 
                        data-collateral-address="${vault.collateral_address}">
                        Liquidate
                    </button>
                </td>
            </tr>
        `;
    }
    elements.tableBody.innerHTML = html;
}

async function showLiquidationModal(target) {
    const { user, debt, collateralAddress } = target;
    currentLiquidationTarget = target;

    const tghsxToRepay = ethers.BigNumber.from(debt);
    
    elements.modalVaultOwner.textContent = formatAddress(user);
    elements.modalRepayAmount.textContent = `${parseFloat(ethers.utils.formatUnits(tghsxToRepay, 6)).toFixed(2)} tGHSX`;
    
    const collateralInfo = appState.supportedCollaterals.find(c => c.address.toLowerCase() === collateralAddress.toLowerCase());
    elements.modalReceiveCollateral.textContent = `All of their ${collateralInfo ? collateralInfo.symbol : 'Collateral'}`;

    elements.modal.classList.add('show');
}

function hideLiquidationModal() {
    elements.modal.classList.remove('show');
    currentLiquidationTarget = null;
}

async function executeLiquidation() {
    if (!currentLiquidationTarget) return;

    // FIX: Use the correct dataset property name 'collateralAddress'
    const { user: userToLiquidate, debt: debtToRepay, collateralAddress } = currentLiquidationTarget;
    const button = document.querySelector(`button[data-user="${userToLiquidate}"]`);
    
    hideLiquidationModal();
    button.disabled = true;
    button.textContent = 'Processing...';

    try {
        if (!appState.collateralVaultContract || !appState.tghsxTokenContract) throw new Error("Contracts not initialized.");

        // 1. Approve the vault to spend the liquidator's tGHSX
        showToast('Checking tGHSX allowance...', 'info');
        const allowance = await appState.tghsxTokenContract.allowance(appState.userAccount, appState.collateralVaultContract.address);
        if (allowance.lt(debtToRepay)) {
            showToast('Approving vault to spend your tGHSX...', 'info');
            const approveTx = await appState.tghsxTokenContract.approve(appState.collateralVaultContract.address, ethers.constants.MaxUint256);
            await approveTx.wait();
            showToast('Approval successful.', 'success');
        }

        // 2. Call the liquidate function with the correct arguments
        // FIX: The function signature is `liquidate(address user, address collateral)`
        showToast('Sending liquidation transaction...', 'info');
        const liquidateTx = await appState.collateralVaultContract.liquidate(userToLiquidate, collateralAddress);
        await liquidateTx.wait();

        showToast('Liquidation successful!', 'success');
        fetchAndRenderRiskyVaults(); // Refresh the list

    } catch (error) {
        showToast(getErrorMessage(error), 'error');
    } finally {
        button.disabled = false;
        button.textContent = 'Liquidate';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    document.addEventListener('networkConnected', fetchAndRenderRiskyVaults);

    elements.tableBody.addEventListener('click', (event) => {
        const button = event.target.closest('.liquidate-btn');
        if (button) {
            if (!appState.signer) return showToast('Please connect your wallet first.', 'error');
            if (appState.userAccount.toLowerCase() === button.dataset.user.toLowerCase()) return showToast('You cannot liquidate your own vault.', 'error');
            showLiquidationModal(button.dataset);
        }
    });

    elements.modalConfirmBtn.addEventListener('click', executeLiquidation);
    elements.modalCancelBtn.addEventListener('click', hideLiquidationModal);

    if (appState.isCorrectNetwork) {
        fetchAndRenderRiskyVaults();
    }
});
