import { ethers } from "https://cdn.ethers.io/lib/ethers-5.2.esm.min.js";
import { depositCollateral, withdrawCollateral, mintTghsx, burnTghsx } from './shared-wallet.js';
import { checkAuth, showNotification } from './auth.js';

document.addEventListener('DOMContentLoaded', () => {
    checkAuth();

    const depositForm = document.getElementById('depositForm');
    const withdrawForm = document.getElementById('withdrawForm');
    const mintForm = document.getElementById('mintForm');
    const burnForm = document.getElementById('burnForm');

    if (depositForm) {
        depositForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const amount = document.getElementById('depositAmount').value;
            if (!amount || parseFloat(amount) <= 0) {
                showNotification('Please enter a valid amount to deposit.', true);
                return;
            }
            
            showNotification('Processing deposit...', false);
            try {
                await depositCollateral(amount);
                showNotification('Deposit successful!', false);
                // Optionally, refresh balance display
            } catch (error) {
                console.error('Deposit failed:', error);
                showNotification(`Deposit failed: ${error.message}`, true);
            }
        });
    }

    if (withdrawForm) {
        withdrawForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const amount = document.getElementById('withdrawAmount').value;
             if (!amount || parseFloat(amount) <= 0) {
                showNotification('Please enter a valid amount to withdraw.', true);
                return;
            }

            showNotification('Processing withdrawal...', false);
            try {
                await withdrawCollateral(amount);
                showNotification('Withdrawal successful!', false);
            } catch (error) {
                console.error('Withdrawal failed:', error);
                showNotification(`Withdrawal failed: ${error.message}`, true);
            }
        });
    }

    if (mintForm) {
        mintForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const amount = document.getElementById('mintAmount').value;
            if (!amount || parseFloat(amount) <= 0) {
                showNotification('Please enter a valid amount to mint.', true);
                return;
            }

            showNotification('Processing mint...', false);
            try {
                await mintTghsx(amount);
                showNotification('tGHSX minted successfully!', false);
            } catch (error) {
                console.error('Minting failed:', error);
                showNotification(`Minting failed: ${error.message}`, true);
            }
        });
    }

    if (burnForm) {
        burnForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const amount = document.getElementById('burnAmount').value;
            if (!amount || parseFloat(amount) <= 0) {
                showNotification('Please enter a valid amount to burn.', true);
                return;
            }

            showNotification('Processing burn...', false);
            try {
                await burnTghsx(amount);
                showNotification('tGHSX burned successfully!', false);
            } catch (error) {
                console.error('Burning failed:', error);
                showNotification(`Burning failed: ${error.message}`, true);
            }
        });
    }
});
