/**
 * ==================================================================================
 * Liquidations Page Logic (liquidations.js)
 *
 * Fetches and displays vaults eligible for liquidation.
 * Allows users to initiate liquidation transactions with a gas fee estimate.
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
    modalGasFee: document.getElementById('modalGasFee'), // NEW: Gas fee element
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
        elements.emptyState.classList.toggle('hidden', vaults.length > 0);
        if (vaults.length > 0) renderVaults(vaults);

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
        const ratio = parseFloat(vault.collateralization_ratio) / 100;

        row.innerHTML = `
            <td data-label="Vault Owner"><a href="https://amoy.polygonscan.com/address/${vault.wallet_address}" target="_blank" class="address-link">${formatAddress(vault.wallet_address)}</a></td>
            <td data-label="Collateral (ETH)">${parseFloat(collateralEth).toFixed(4)} ETH</td>
            <td data-label="Debt (tGHSX)">${parseFloat(debtTghsx).toFixed(2)} tGHSX</td>
            <td data-label="Collateral Ratio"><span class="ratio-danger">${ratio.toFixed(2)}%</span></td>
            <td data-label="Action">
                <button class="liquidate-btn" data-user="${vault.wallet_address}" data-debt="${vault.tghsx_minted}" data-collateral="${vault.eth_collateral}">
                    Liquidate
                </button>
            </td>
        `;
    });
}

async function showLiquidationModal(target) {
    currentLiquidationTarget = target;
    const { user, debt } = target;

    elements.modalVaultOwner.textContent = formatAddress(user);
    
    // Calculate 50% of the debt to repay
    const tghsxToRepay = ethers.BigNumber.from(debt).div(2);
    elements.modalRepayAmount.textContent = `~${parseFloat(ethers.utils.formatEther(tghsxToRepay)).toFixed(2)} tGHSX`;
    
    // Clear previous values and show loading state
    elements.modalReceiveCollateral.textContent = `Calculating...`;
    elements.modalGasFee.textContent = 'Calculating...';
    elements.modal.classList.add('show');

    // Estimate collateral and gas fee asynchronously
    try {
        if (!appState.collateralVaultContract || !appState.provider) {
            throw new Error("Wallet not fully connected.");
        }
        
        // Estimate gas fee
        const gasPrice = await appState.provider.getGasPrice();
        const estimatedGasLimit = await appState.collateralVaultContract.estimateGas.liquidateVault(user, tghsxToRepay);
        const gasFee = estimatedGasLimit.mul(gasPrice);
        elements.modalGasFee.textContent = `~${ethers.utils.formatEther(gasFee).toString()} MATIC`;

        // Estimate collateral to receive (this is a simplified off-chain estimate)
        const ethGhsPrice = await appState.collateralVaultContract.getEthGhsPrice();
        const liquidatedETH = tghsxToRepay.mul(ethers.utils.parseEther("1")).div(ethGhsPrice);
        const bonus = liquidatedETH.mul(500).div(10000); // 5% bonus
        const totalETHToReceive = liquidatedETH.add(bonus);
        elements.modalReceiveCollateral.textContent = `~${parseFloat(ethers.utils.formatEther(totalETHToReceive)).toFixed(4)} ETH`;

    } catch (e) {
        console.error("Error estimating liquidation values:", e);
        elements.modalReceiveCollateral.textContent = `Error`;
        elements.modalGasFee.textContent = 'Error estimating fee';
    }
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
