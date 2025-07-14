/**
 * ==================================================================================
 * Admin Dashboard Logic (admin.js)
 *
 * Manages the admin dashboard, updated to match the latest backend responses
 * and contract logic.
 * ==================================================================================
 */

import { BACKEND_URL, showToast, logoutUser, formatAddress } from './shared-wallet.js';

let currentToken = null;

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
    return response.status === 204 ? {} : response.json();
}

function formatNumber(numStr, decimals = 2) {
    const num = parseFloat(numStr);
    return isNaN(num) ? 'N/A' : num.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: 4 });
}

function timeAgo(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    const seconds = Math.floor((new Date() - date) / 1000);
    if (seconds < 5) return "just now";
    let interval = seconds / 31536000;
    if (interval > 1) return `${Math.floor(interval)} years ago`;
    interval = seconds / 2592000;
    if (interval > 1) return `${Math.floor(interval)} months ago`;
    interval = seconds / 86400;
    if (interval > 1) return `${Math.floor(interval)} days ago`;
    interval = seconds / 3600;
    if (interval > 1) return `${Math.floor(interval)} hours ago`;
    interval = seconds / 60;
    if (interval > 1) return `${Math.floor(interval)} minutes ago`;
    return `${Math.floor(seconds)} seconds ago`;
}

async function fetchContractStatus() {
    try {
        // FIX: Call the correct /admin/status endpoint and handle the new response structure
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
        
        // FIX: Display new data points from the updated API response
        document.getElementById('totalMinted').textContent = formatNumber(ethers.utils.formatUnits(data.totalMintedGlobal, 6));
        document.getElementById('dailyMinted').textContent = formatNumber(ethers.utils.formatUnits(data.globalDailyMinted, 6));
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
        const requests = await apiCall('/mint/admin/pending-requests');
        document.getElementById('requestCount').textContent = `${requests.length} Pending`;

        if (requests.length === 0) {
            emptyState.classList.remove('hidden');
        } else {
            requests.forEach(req => {
                const row = tableBody.insertRow();
                // FIX: Display collateral_address
                row.innerHTML = `
                    <td data-label="Submitted"><span class="tooltip" title="${new Date(req.created_at).toLocaleString()}">${timeAgo(req.created_at)}</span></td>
                    <td data-label="User ID"><span class="tooltip address" title="${req.user_id}">${formatAddress(req.user_id, 12)}</span></td>
                    <td data-label="Collateral Address"><span class="tooltip address" title="${req.collateral_address}">${formatAddress(req.collateral_address)}</span></td>
                    <td data-label="Mint Amount (tGHSX)">${formatNumber(req.mint_amount)}</td>
                    <td data-label="Actions">
                        <button class="btn btn-action btn-approve" data-action="approve" data-request-id="${req.id}">Approve</button>
                        <button class="btn btn-action btn-decline" data-action="decline" data-request-id="${req.id}">Decline</button>
                    </td>
                `;
            });
            requestsTable.style.display = 'table';
        }
    } catch (error) {
        if (error.message !== 'Unauthorized') showToast(`Error fetching requests: ${error.message}`, 'error');
    } finally {
        loadingState.classList.add('hidden');
    }
}

async function refreshAllData() {
    // ... (rest of the function is mostly the same)
    await Promise.all([fetchContractStatus(), fetchPendingRequests()]);
}

function showActionModal(action, requestId) {
    // ... (this function remains the same)
}

function handleConfirm(action, requestId) {
    // ... (this function remains the same)
}

async function executeApprove(requestId) {
    const button = document.querySelector(`button[data-request-id="${requestId}"][data-action="approve"]`);
    if(button) button.disabled = true;
    try {
        // FIX: The backend endpoint is now /admin/approve
        await apiCall('/mint/admin/approve', { method: 'POST', body: JSON.stringify({ request_id: requestId }) });
        // FIX: More informative toast message
        showToast('Request approved! User can now complete the minting.', 'success');
        fetchPendingRequests();
    } catch (error) {
        if (error.message !== 'Unauthorized') showToast(`Approval failed: ${error.message}`, 'error');
        if(button) button.disabled = false;
    }
}

async function executeDecline(requestId) {
    // ... (this function remains the same)
}

async function executePause() {
    // ... (this function remains the same)
}

async function executeResume() {
    // ... (this function remains the same)
}

// --- Page Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    currentToken = localStorage.getItem('accessToken');
    if (!currentToken) {
        logoutUser();
        return;
    }
    // ... (rest of the event listeners are the same)
    refreshAllData();
});
