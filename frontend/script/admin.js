/**
 * ==================================================================================
 * Admin Dashboard Logic (admin.js)
 *
 * Manages the admin dashboard, including protocol status, mint request approvals,
 * and auto-mint configuration.
 * ==================================================================================
 */

import { BACKEND_URL, showToast, logoutUser, formatAddress } from './shared-wallet.js';

let currentToken = null;

// --- API Helper ---
async function apiCall(endpoint, options = {}) {
    const headers = {
        'Authorization': `Bearer ${currentToken}`,
        'Content-Type': 'application/json',
        ...options.headers,
    };
    const response = await fetch(`${BACKEND_URL}${endpoint}`, { ...options, headers });
    
    if (response.status === 401 || response.status === 403) {
        showToast('Access Denied. Logging out.', 'error');
        setTimeout(() => logoutUser(), 1500);
        throw new Error('Unauthorized');
    }

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'An unknown error occurred.' }));
        throw new Error(errorData.detail);
    }
    return response.status === 204 ? {} : await response.json();
}

// --- UI Formatters ---
function formatBigNumber(value, decimals = 6) {
    if (!value) return '0.00';
    try {
        const formatted = ethers.utils.formatUnits(value, decimals);
        return parseFloat(formatted).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    } catch {
        return 'N/A';
    }
}

function timeAgo(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    const seconds = Math.floor((new Date() - date) / 1000);
    if (seconds < 5) return "just now";
    let interval = seconds / 86400;
    if (interval > 1) return `${Math.floor(interval)} days ago`;
    interval = seconds / 3600;
    if (interval > 1) return `${Math.floor(interval)} hours ago`;
    interval = seconds / 60;
    if (interval > 1) return `${Math.floor(interval)} minutes ago`;
    return `${Math.floor(seconds)} seconds ago`;
}

// --- Data Fetching ---

async function fetchContractStatus() {
    try {
        const data = await apiCall('/admin/status');
        const statusEl = document.getElementById('contractStatus');
        const pauseBtn = document.getElementById('pauseBtn');
        const resumeBtn = document.getElementById('resumeBtn');

        if (data.isPaused) {
            statusEl.innerHTML = `<span class="status-badge paused">PAUSED</span>`;
            pauseBtn.disabled = true;
            resumeBtn.disabled = false;
        } else {
            statusEl.innerHTML = `<span class="status-badge active">ACTIVE</span>`;
            pauseBtn.disabled = false;
            resumeBtn.disabled = true;
        }
        
        document.getElementById('totalMinted').textContent = formatBigNumber(data.totalMintedGlobal, 6);
        document.getElementById('dailyMinted').textContent = formatBigNumber(data.globalDailyMinted, 6);
        document.getElementById('collateralTypes').textContent = data.totalCollateralTypes;

    } catch (error) {
        if (error.message !== 'Unauthorized') showToast(`Error fetching status: ${error.message}`, 'error');
    }
}

async function fetchPendingRequests() {
    const loadingState = document.getElementById('loadingState');
    const emptyState = document.getElementById('emptyState');
    const requestsTable = document.getElementById('requestsTable');
    const tableBody = document.getElementById('requestsTableBody');

    loadingState.classList.remove('hidden');
    emptyState.classList.add('hidden');
    requestsTable.style.display = 'none';
    tableBody.innerHTML = '';

    try {
        const requests = await apiCall('/admin/mint-requests?status=pending'); 
        document.getElementById('requestCount').textContent = `${requests.length} Pending`;

        if (requests.length === 0) {
            emptyState.classList.remove('hidden');
        } else {
            requests.forEach(req => {
                const row = tableBody.insertRow();
                row.innerHTML = `
                    <td data-label="Submitted"><span class="tooltip" title="${new Date(req.created_at).toLocaleString()}">${timeAgo(req.created_at)}</span></td>
                    <td data-label="User ID"><span class="tooltip address" title="${req.user_id}">${formatAddress(req.user_id, 12)}</span></td>
                    <td data-label="Collateral Address"><span class="tooltip address" title="${req.collateral_address}">${formatAddress(req.collateral_address)}</span></td>
                    <td data-label="Mint Amount (tGHSX)">${parseFloat(req.mint_amount).toLocaleString()}</td>
                    <td data-label="Actions">
                        <button class="btn btn-action btn-approve" data-request-id="${req.id}">Approve</button>
                        <button class="btn btn-action btn-decline" data-request-id="${req.id}">Decline</button>
                    </td>
                `;
            });
            requestsTable.style.display = 'table';
        }
    } catch (error) {
        if (error.message !== 'Unauthorized') showToast(`Error fetching requests: ${error.message}`, 'error');
        emptyState.classList.remove('hidden');
    } finally {
        loadingState.classList.add('hidden');
    }
}

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

// --- Action Handlers ---

function showConfirmationModal(action, callback) {
    const modal = document.getElementById('confirmationModal');
    const modalText = document.getElementById('modalText');
    const confirmBtn = document.getElementById('modalConfirmBtn');

    modalText.textContent = `Are you sure you want to ${action}?`;
    modal.classList.add('show');

    confirmBtn.onclick = () => {
        modal.classList.remove('show');
        callback();
    };
}

async function handleMintRequestAction(action, requestId) {
    showConfirmationModal(`${action} this request`, async () => {
        const button = document.querySelector(`button[data-request-id="${requestId}"]`);
        if(button) button.closest('td').innerHTML = 'Processing...';

        try {
            const endpoint = action === 'approve' ? '/mint/admin/approve' : '/mint/admin/decline';
            await apiCall(endpoint, {
                method: 'POST',
                body: JSON.stringify({ request_id: requestId })
            });
            showToast(`Request ${action}d successfully.`, 'success');
            fetchPendingRequests();
        } catch (error) {
            if (error.message !== 'Unauthorized') showToast(`${action.charAt(0).toUpperCase() + action.slice(1)} failed: ${error.message}`, 'error');
            fetchPendingRequests();
        }
    });
}

async function handleContractAction(action) {
     showConfirmationModal(action, async () => {
        try {
            const endpoint = action === 'pause' ? '/admin/pause' : '/admin/unpause';
            showToast(`Sending ${action} transaction...`, 'info');
            const res = await apiCall(endpoint, { method: 'POST' });
            showToast(`Protocol ${action}d successfully. Tx: ${formatAddress(res.transactionHash)}`, 'success');
            fetchContractStatus();
        } catch (error) {
             if (error.message !== 'Unauthorized') showToast(`Failed to ${action} protocol: ${error.message}`, 'error');
        }
    });
}

async function handleToggleAutoMint(event) {
    const isEnabled = event.target.checked;
    try {
        await apiCall(`/admin/toggle-automint?enabled=${isEnabled}`, { method: 'POST' });
        showToast(`Auto-Mint has been ${isEnabled ? 'enabled' : 'disabled'}.`, 'success');
        document.getElementById('autoMintStatusText').textContent = isEnabled ? 'Enabled' : 'Disabled';
    } catch (error) {
        if (error.message !== 'Unauthorized') showToast(`Failed to toggle auto-mint: ${error.message}`, 'error');
        event.target.checked = !isEnabled;
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

    showConfirmationModal('save the new Auto-Mint configuration', async () => {
        try {
            await apiCall('/admin/update-automint-config', {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            showToast('Auto-Mint configuration saved successfully.', 'success');
        } catch (error) {
            if (error.message !== 'Unauthorized') showToast(`Failed to save config: ${error.message}`, 'error');
        }
    });
}

// --- Page Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    currentToken = localStorage.getItem('accessToken');
    if (!currentToken) {
        logoutUser();
        return;
    }
    
    document.getElementById('requestsTableBody').addEventListener('click', (e) => {
        const approveBtn = e.target.closest('.btn-approve');
        const declineBtn = e.target.closest('.btn-decline');
        if (approveBtn) handleMintRequestAction('approve', approveBtn.dataset.requestId);
        if (declineBtn) handleMintRequestAction('decline', declineBtn.dataset.requestId);
    });

    document.getElementById('pauseBtn').addEventListener('click', () => handleContractAction('pause'));
    document.getElementById('resumeBtn').addEventListener('click', () => handleContractAction('unpause'));
    document.getElementById('modalCancelBtn').addEventListener('click', () => {
        document.getElementById('confirmationModal').classList.remove('show');
    });
    
    document.getElementById('autoMintToggle').addEventListener('change', handleToggleAutoMint);
    document.getElementById('saveAutoMintConfigBtn').addEventListener('click', handleSaveAutoMintConfig);
    document.getElementById('refreshBtn').addEventListener('click', () => {
        showToast('Refreshing data...', 'info');
        fetchContractStatus();
        fetchPendingRequests();
        fetchAutoMintConfig();
    });

    fetchContractStatus();
    fetchPendingRequests();
    fetchAutoMintConfig();
});
