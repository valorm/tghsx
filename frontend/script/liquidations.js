/**
 * ==================================================================================
 * Liquidations Page Logic (liquidations.js)
 *
 * Fetches and displays vaults eligible for liquidation.
 * Allows users to initiate liquidation transactions using a custom modal.
 * Relies on shared-wallet.js for wallet connection and contract instances.
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
        if (!token) {
            throw new Error('Please log in to view liquidations.');
        }

        const response = await fetch(`${BACKEND_URL}/liquidations/at-risk`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            throw new Error('Failed to fetch at-risk vaults.');
        }

        const vaults = await response.json();

        if (vaults.length === 0) {
            elements.emptyState.classList.remove('hidden');
        } else {
            renderVaults(vaults);
        }

    } catch (error) {
        console.error('Error fetching risky vaults:', error);
        showToast(error.message, 'error');
        elements.emptyState.textContent = 'Could not load data. Please try again later.';
        elements.emptyState.classList.remove('hidden');
    } finally {
        elements.loadingState.classList.add('hidden');
    }
}

function renderVaults(vaults) {
    vaults.forEach(vault => {
        const row = elements.tableBody.insertRow();
        const collateralEth = ethers.utils.formatEther(vault.eth_collateral);
        const debtTghsx = ethers.utils.formatEther(vault.tghsx_minted);
        const ratio = (parseFloat(vault.collateralization_ratio) / 10000).toFixed(2);

        row.innerHTML = `
            <td data-label="Vault Owner"><a href="https://amoy.polygonscan.com/address/${vault.wallet_address}" target="_blank" class="address-link">${formatAddress(vault.wallet_address)}</a></td>
            <td data-label="Collateral (ETH)">${parseFloat(collateralEth).toFixed(4)} ETH</td>
            <td data-label="Debt (tGHSX)">${parseFloat(debtTghsx).toFixed(2)} tGHSX</td>
            <td data-label="Collateral Ratio"><span class="ratio-danger">${ratio}%</span></td>
            <td data-label="Action">
                <button class="liquidate-btn" data-user="${vault.wallet_address}" data-debt="${vault.tghsx_minted}" data-collateral="${vault.eth_collateral}">
                    Liquidate
                </button>
            </td>
        `;
    });
}

async function showLiquidationModal(target) {
    const { user, debt, collateral } = target;
    currentLiquidationTarget = target;

    const tghsxToRepay = ethers.BigNumber.from(debt).div(2);
    const ethToReceive = (ethers.BigNumber.from(collateral).div(2)).mul(105).div(100);

    elements.modalVaultOwner.textContent = formatAddress(user);
    elements.modalRepayAmount.textContent = `~${parseFloat(ethers.utils.formatEther(tghsxToRepay)).toFixed(2)} tGHSX`;
    elements.modalReceiveCollateral.textContent = `~${parseFloat(ethers.utils.formatEther(ethToReceive)).toFixed(4)} ETH`;

    elements.modal.classList.add('show');
}

function hideLiquidationModal() {
    elements.modal.classList.remove('show');
    currentLiquidationTarget = null;
}

async function executeLiquidation() {
    if (!currentLiquidationTarget) return;

    const { user: userToLiquidate, debt: userDebtWei } = currentLiquidationTarget;
    const button = document.querySelector(`button[data-user="${userToLiquidate}"]`);
    
    hideLiquidationModal();
    button.disabled = true;
    button.textContent = 'Processing...';

    try {
        if (!appState.collateralVaultContract || !appState.tghsxTokenContract) {
            throw new Error("Contracts not initialized. Please reconnect wallet.");
        }

        const tghsxToRepay = ethers.BigNumber.from(userDebtWei).div(2);
        
        showToast('Checking tGHSX allowance...', 'info');
        const allowance = await appState.tghsxTokenContract.allowance(appState.userAccount, appState.collateralVaultContract.address);

        if (allowance.lt(tghsxToRepay)) {
            showToast('Please approve the vault to spend your tGHSX.', 'info');
            const approveTx = await appState.tghsxTokenContract.approve(appState.collateralVaultContract.address, ethers.constants.MaxUint256);
            await approveTx.wait();
            showToast('Approval successful. Proceeding with liquidation.', 'success');
        }

        showToast('Sending liquidation transaction...', 'info');
        const liquidateTx = await appState.collateralVaultContract.liquidateVault(userToLiquidate, tghsxToRepay);
        await liquidateTx.wait();

        showToast('Liquidation successful!', 'success');
        fetchAndRenderRiskyVaults();

    } catch (error) {
        console.error('Liquidation failed:', error);
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
            if (!appState.signer) {
                showToast('Please connect your wallet first.', 'error');
                return;
            }
            if (appState.userAccount.toLowerCase() === button.dataset.user.toLowerCase()) {
                showToast('You cannot liquidate your own vault.', 'error');
                return;
            }
            showLiquidationModal(button.dataset);
        }
    });

    elements.modalConfirmBtn.addEventListener('click', executeLiquidation);
    elements.modalCancelBtn.addEventListener('click', hideLiquidationModal);

    if (appState.isCorrectNetwork) {
        fetchAndRenderRiskyVaults();
    }
});
