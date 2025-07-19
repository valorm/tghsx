// In /script/admin.js

import { BACKEND_URL, showToast, logoutUser, formatAddress } from './shared-wallet.js';
// ... (existing apiCall, formatBigNumber, timeAgo functions)

// --- NEW: Functions for Auto-Mint Configuration ---

async function fetchAutoMintConfig() {
    try {
        const config = await apiCall('/admin/automint-config');
        
        const toggle = document.getElementById('autoMintToggle');
        const statusText = document.getElementById('autoMintStatusText');
        
        toggle.checked = config.isEnabled;
        statusText.textContent = config.isEnabled ? 'Enabled' : 'Disabled';
        
        document.getElementById('baseReward').value = config.baseReward;
        document.getElementById('bonusMultiplier').value = config.bonusMultiplier;
        document.getElementById('minHoldTime').value = config.minHoldTime;
        document.getElementById('collateralRequirement').value = config.collateralRequirement;

    } catch (error) {
        if (error.message !== 'Unauthorized') showToast(`Error fetching auto-mint config: ${error.message}`, 'error');
    }
}

async function handleToggleAutoMint(event) {
    const isEnabled = event.target.checked;
    try {
        await apiCall(`/admin/toggle-automint?enabled=${isEnabled}`, { method: 'POST' });
        showToast(`Auto-Mint has been ${isEnabled ? 'enabled' : 'disabled'}.`, 'success');
        document.getElementById('autoMintStatusText').textContent = isEnabled ? 'Enabled' : 'Disabled';
    } catch (error) {
        if (error.message !== 'Unauthorized') showToast(`Failed to toggle auto-mint: ${error.message}`, 'error');
        event.target.checked = !isEnabled; // Revert checkbox on failure
    }
}

async function handleSaveAutoMintConfig() {
    const payload = {
        baseReward: parseInt(document.getElementById('baseReward').value, 10),
        bonusMultiplier: parseInt(document.getElementById('bonusMultiplier').value, 10),
        minHoldTime: parseInt(document.getElementById('minHoldTime').value, 10),
        collateralRequirement: parseInt(document.getElementById('collateralRequirement').value, 10),
    };

    if (Object.values(payload).some(v => isNaN(v))) {
        return showToast('All config values must be valid numbers.', 'error');
    }

    try {
        await apiCall('/admin/update-automint-config', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        showToast('Auto-Mint configuration saved successfully.', 'success');
    } catch (error) {
        if (error.message !== 'Unauthorized') showToast(`Failed to save config: ${error.message}`, 'error');
    }
}


// --- Page Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    // ... (existing event listeners for logout, mint requests, pause/resume)

    // --- NEW: Event Listeners for Auto-Mint ---
    document.getElementById('autoMintToggle')?.addEventListener('change', handleToggleAutoMint);
    document.getElementById('saveAutoMintConfigBtn')?.addEventListener('click', handleSaveAutoMintConfig);

    // Initial data fetch
    fetchContractStatus();
    fetchPendingRequests();
    fetchAutoMintConfig(); // Fetch the new config data
});
