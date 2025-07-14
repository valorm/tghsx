/**
 * ==================================================================================
 * Liquidations Page Logic (liquidations.js)
 *
 * Fetches and displays vaults eligible for liquidation and allows users to
 * initiate liquidation transactions. Updated for the latest contract functions.
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

        if (!response.ok) throw new Error('Failed to fetch at-risk vaults.');
        
        const vaults = await response.json();
        if (vaults.length === 0) {
            elements.emptyState.classList.remove('hidden');
        } else {
            renderVaults(vaults);
        }

    } catch (error) {
        showToast(error.message, 'error');
        elements.emptyState.classList.remove('hidden');
    } finally {
        elements.loadingState.classList.add('hidden');
    }
}

function renderVaults(vaults) {
    vaults.forEach(vault => {
        const row = elements.tableBody.insertRow();
        
        // FIX: The backend now returns amounts in wei, format them correctly.
        // Assuming collateral and tGHSX decimals for formatting. This should be dynamic in a full implementation.
        const collateralAmount = ethers.utils.formatUnits(vault.collateral_amount, 18); // Assuming 18 decimals for collateral
        const debtAmount = ethers.utils.formatUnits(vault.minted_amount, 6); // tGHSX has 6 decimals
        const ratio = parseFloat(ethers.utils.formatUnits(vault.collateralization_ratio, 6)) * 100;

        row.innerHTML = `
            <td data-label="Vault Owner"><a href="https://amoy.polygonscan.com/address/${vault.wallet_address}" target="_blank" class="address-link">${formatAddress(vault.wallet_address)}</a></td>
            <td data-label="Collateral">${parseFloat(collateralAmount).toFixed(4)}</td>
            <td data-label="Debt">${parseFloat(debtAmount).toFixed(2)} tGHSX</td>
            <td data-label="Collateral Ratio"><span class="ratio-danger">${ratio.toFixed(2)}%</span></td>
            <td data-label="Action">
                <button class="liquidate-btn" 
                    data-user="${vault.wallet_address}" 
                    data-debt="${vault.minted_amount}" 
                    data-collateral-token="${vault.collateral_type}">
                    Liquidate
                </button>
            </td>
        `;
    });
}

async function showLiquidationModal(target) {
    const { user, debt, collateralToken } = target;
    currentLiquidationTarget = target;

    // Logic to calculate what the liquidator repays and receives
    const tghsxToRepay = ethers.BigNumber.from(debt); // Liquidator repays the full debt
    
    elements.modalVaultOwner.textContent = formatAddress(user);
    elements.modalRepayAmount.textContent = `${parseFloat(ethers.utils.formatUnits(tghsxToRepay, 6)).toFixed(2)} tGHSX`;
    elements.modalReceiveCollateral.textContent = `All Collateral + Bonus`; // The contract handles the calculation

    elements.modal.classList.add('show');
}

function hideLiquidationModal() {
    elements.modal.classList.remove('show');
    currentLiquidationTarget = null;
}

async function executeLiquidation() {
    if (!currentLiquidationTarget) return;

    const { user: userToLiquidate, debt: debtToRepay, collateralToken } = currentLiquidationTarget;
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

        // 2. Call the liquidate function
        // FIX: Use the correct `liquidate` function signature from the contract
        showToast('Sending liquidation transaction...', 'info');
        const liquidateTx = await appState.collateralVaultContract.liquidate(userToLiquidate, collateralToken);
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
