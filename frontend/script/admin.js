/**
 * ==================================================================================
 * Admin Dashboard Logic (admin.js)
 *
 * Manages the admin dashboard, including fetching pending mint requests,
 * controlling protocol status (pause/resume), and handling admin actions like
 * updating the GHS price.
 * ==================================================================================
 */

import { BACKEND_URL, showToast, logoutUser } from './shared-wallet.js';

let currentToken = null;

/**
 * A wrapper for making authenticated API calls to the backend.
 */
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

function formatNumber(numStr) {
    const num = parseFloat(numStr);
    if (isNaN(num)) return 'N/A';
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

function truncate(str, len = 12) {
    if (!str || str.length <= len) return str;
    return `${str.slice(0, len)}...`;
}

function timeAgo(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Invalid Date';
    const seconds = Math.floor((new Date() - date) / 1000);
    if (seconds < 5) return "just now";
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + " years ago";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + " months ago";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + " days ago";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + " hours ago";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + " minutes ago";
    return Math.floor(seconds) + " seconds ago";
}

/**
 * Fetches and displays the current status of the smart contract.
 */
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
        document.getElementById('ethUsdFeed').textContent = data.ethUsdPriceFeed;
        document.getElementById('currentGhsPrice').textContent = `GH₵ ${data.ghsUsdPrice}`;

    } catch (error) {
        if (error.message !== 'Unauthorized') {
             showToast(`Error fetching status: ${error.message}`, 'error');
        }
    }
}

/**
 * Fetches and displays pending mint requests.
 */
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
                row.innerHTML = `
                    <td data-label="Submitted"><span class="tooltip" title="${new Date(req.created_at).toLocaleString()}">${timeAgo(req.created_at)}</span></td>
                    <td data-label="User ID"><span class="tooltip address" title="${req.user_id}">${truncate(req.user_id)}</span></td>
                    <td data-label="Collateral (ETH)">${formatNumber(req.collateral_amount)}</td>
                    <td data-label="Mint Amount (tGHSX)">${formatNumber(req.mint_amount)}</td>
                    <td data-label="Ratio (%)">${parseFloat(req.collateral_ratio).toFixed(2)}%</td>
                    <td data-label="Actions">
                        <button class="btn btn-action btn-approve" data-action="approve" data-request-id="${req.id}">Approve</button>
                        <button class="btn btn-action btn-decline" data-action="decline" data-request-id="${req.id}">Decline</button>
                    </td>
                `;
            });
            requestsTable.style.display = 'table';
        }
    } catch (error) {
        if (error.message !== 'Unauthorized') {
            showToast(`Error fetching requests: ${error.message}`, 'error');
        }
    } finally {
        loadingState.classList.add('hidden');
    }
}

/**
 * Refreshes all data on the admin dashboard.
 */
async function refreshAllData() {
    const refreshButton = document.getElementById('refreshBtn');
    const originalContent = refreshButton.innerHTML;
    refreshButton.disabled = true;
    refreshButton.innerHTML = `<span class="loading-indicator"></span> Refreshing...`;

    try {
        await Promise.all([
            fetchContractStatus(),
            fetchPendingRequests()
        ]);
        showToast('Dashboard updated.', 'success');
    } catch (error) {
        if (error.message !== 'Unauthorized') {
            showToast('Failed to refresh all data.', 'error');
        }
    } finally {
        refreshButton.disabled = false;
        refreshButton.innerHTML = originalContent;
    }
}

/**
 * Shows a confirmation modal for a given action.
 */
function showActionModal(action, requestIdOrPrice) {
    const modal = document.getElementById('actionModal');
    const titleEl = document.getElementById('modalTitle');
    const textEl = document.getElementById('modalText');
    const confirmBtn = document.getElementById('modalConfirmBtn');

    const config = {
        pause: { title: 'Pause Protocol', text: 'Are you sure you want to pause all protocol operations?', btnText: 'Pause', btnClass: 'btn-decline' },
        resume: { title: 'Resume Protocol', text: 'Are you sure you want to resume all protocol operations?', btnText: 'Resume', btnClass: 'btn-approve' },
        approve: { title: 'Approve Request', text: 'Are you sure you want to approve this mint request?', btnText: 'Approve', btnClass: 'btn-approve' },
        decline: { title: 'Decline Request', text: 'Are you sure you want to decline this mint request?', btnText: 'Decline', btnClass: 'btn-decline' },
        updatePrice: { title: 'Update GHS Price', text: `Are you sure you want to set the new GHS/USD price to ${requestIdOrPrice}?`, btnText: 'Update Price', btnClass: 'btn-primary' }
    };

    const actionConfig = config[action];
    titleEl.textContent = actionConfig.title;
    textEl.textContent = actionConfig.text;
    confirmBtn.textContent = actionConfig.btnText;
    confirmBtn.className = `btn modal-btn ${actionConfig.btnClass}`;
    
    modal.classList.add('show');

    confirmBtn.onclick = () => {
        modal.classList.remove('show');
        handleConfirm(action, requestIdOrPrice);
    };
}

/**
 * Handles the confirmation of an action from the modal.
 */
function handleConfirm(action, requestIdOrPrice) {
    switch (action) {
        case 'approve': executeApprove(requestIdOrPrice); break;
        case 'decline': executeDecline(requestIdOrPrice); break;
        case 'pause': executePause(); break;
        case 'resume': executeResume(); break;
        case 'updatePrice': executeUpdateGhsPrice(requestIdOrPrice); break;
    }
}

/**
 * Executes the GHS price update.
 */
async function executeUpdateGhsPrice(newPrice) {
    const btn = document.getElementById('updateGhsPriceBtn');
    btn.disabled = true;
    try {
        await apiCall('/admin/update-ghs-price', { 
            method: 'POST', 
            body: JSON.stringify({ new_price: newPrice }) 
        });
        showToast('GHS price updated successfully!', 'success');
        document.getElementById('newGhsPriceInput').value = '';
        fetchContractStatus();
    } catch(e) {
        if (e.message !== 'Unauthorized') {
            showToast(`Price update failed: ${e.message}`, 'error');
        }
    } finally {
        btn.disabled = false;
    }
}

async function executeApprove(requestId) {
    const button = document.querySelector(`button[data-request-id="${requestId}"][data-action="approve"]`);
    if(button) button.disabled = true;
    try {
        await apiCall('/mint/admin/mint', { method: 'POST', body: JSON.stringify({ request_id: requestId }) });
        showToast('Request approved successfully!', 'success');
        fetchPendingRequests();
    } catch (error) {
        if (error.message !== 'Unauthorized') {
            showToast(`Approval failed: ${error.message}`, 'error');
        }
        if(button) button.disabled = false;
    }
}

async function executeDecline(requestId) {
    const button = document.querySelector(`button[data-request-id="${requestId}"][data-action="decline"]`);
    if(button) button.disabled = true;
    try {
        await apiCall('/mint/admin/decline', { method: 'POST', body: JSON.stringify({ request_id: requestId }) });
        showToast('Request declined successfully.', 'success');
        fetchPendingRequests();
    } catch (error) {
        if (error.message !== 'Unauthorized') {
            showToast(`Decline failed: ${error.message}`, 'error');
        }
        if(button) button.disabled = false;
    }
}

async function executePause() {
    const btn = document.getElementById('pauseBtn');
    btn.disabled = true;
    try {
        await apiCall('/admin/pause', { method: 'POST' });
        showToast('Protocol paused successfully!', 'success');
        fetchContractStatus();
    } catch(e) { 
        if (e.message !== 'Unauthorized') {
            showToast(e.message, 'error');
        }
        btn.disabled = false;
    }
}

async function executeResume() {
    const btn = document.getElementById('resumeBtn');
    btn.disabled = true;
    try {
        await apiCall('/admin/unpause', { method: 'POST' });
        showToast('Protocol resumed successfully!', 'success');
        fetchContractStatus();
    } catch(e) { 
        if (e.message !== 'Unauthorized') {
            showToast(e.message, 'error');
        }
        btn.disabled = false; 
    }
}

// --- Page Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    currentToken = localStorage.getItem('accessToken');

    if (!currentToken) {
        logoutUser();
        return;
    }
    
    document.getElementById('logoutBtn').addEventListener('click', logoutUser);
    document.getElementById('refreshBtn').addEventListener('click', refreshAllData);
    document.getElementById('pauseBtn').addEventListener('click', () => showActionModal('pause'));
    document.getElementById('resumeBtn').addEventListener('click', () => showActionModal('resume'));
    document.getElementById('modalCancelBtn').addEventListener('click', () => {
        document.getElementById('actionModal').classList.remove('show');
    });

    document.getElementById('updateGhsPriceBtn').addEventListener('click', () => {
        const newPrice = document.getElementById('newGhsPriceInput').value;
        if (!newPrice || isNaN(parseFloat(newPrice)) || parseFloat(newPrice) <= 0) {
            showToast('Please enter a valid positive number for the price.', 'error');
            return;
        }
        showActionModal('updatePrice', newPrice);
    });

    document.getElementById('requestsTableBody').addEventListener('click', (event) => {
        const button = event.target.closest('button.btn-action');
        if (button) {
            const { action, requestId } = button.dataset;
            if (action && requestId) {
                showActionModal(action, requestId);
            }
        }
    });

    refreshAllData();
});
