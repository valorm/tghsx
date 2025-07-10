/**
 * ==================================================================================
 * Admin Dashboard Logic (admin.js)
 *
 * Manages the admin dashboard, including fetching pending mint requests,
 * controlling protocol status (pause/resume), and handling admin actions.
 * Relies on shared-wallet.js for authentication and utilities.
 * ==================================================================================
 */

let currentToken = null;

/**
 * A wrapper for making authenticated API calls to the backend.
 * @param {string} endpoint - The API endpoint to call.
 * @param {object} options - Fetch options (method, body, etc.).
 * @returns {Promise<object>} - The JSON response from the API.
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

/**
 * Formats a number string into a locale-specific string.
 * @param {string} numStr - The number string to format.
 * @returns {string} - The formatted number.
 */
function formatNumber(numStr) {
    const num = parseFloat(numStr);
    if (isNaN(num)) return 'N/A';
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

/**
 * Truncates a string to a specified length.
 * @param {string} str - The string to truncate.
 * @param {number} len - The maximum length.
 * @returns {string} - The truncated string.
 */
function truncate(str, len = 12) {
    if (!str || str.length <= len) return str;
    return `${str.slice(0, len)}...`;
}

/**
 * Converts a date string to a "time ago" format.
 * @param {string} dateString - The ISO date string.
 * @returns {string} - The relative time string (e.g., "5 minutes ago").
 */
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
        document.getElementById('usdGhsFeed').textContent = data.usdGhsPriceFeed;
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
    requestsTable.style.display = 'none'; // Use style to hide table structure
    tableBody.innerHTML = ''; // Clear previous results

    try {
        const requests = await apiCall('/mint/admin/pending-requests');
        document.getElementById('requestCount').textContent = `${requests.length} Pending`;

        if (requests.length === 0) {
            emptyState.classList.remove('hidden');
        } else {
            requests.forEach(req => {
                const row = tableBody.insertRow();
                row.innerHTML = `
                    <td><span class="tooltip" title="${new Date(req.created_at).toLocaleString()}">${timeAgo(req.created_at)}</span></td>
                    <td><span class="tooltip address" title="${req.user_id}">${truncate(req.user_id)}</span></td>
                    <td>${formatNumber(req.collateral_amount)}</td>
                    <td>${formatNumber(req.mint_amount)}</td>
                    <td>${parseFloat(req.collateral_ratio).toFixed(2)}%</td>
                    <td>
                        <button class="btn btn-action btn-approve" data-action="approve" data-request-id="${req.id}">Approve</button>
                        <button class="btn btn-action btn-decline" data-action="decline" data-request-id="${req.id}">Decline</button>
                    </td>
                `;
            });
            requestsTable.style.display = 'table'; // Show table
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
 * @param {string} action - The action type ('approve', 'decline', 'pause', 'resume').
 * @param {string} [requestId] - The ID of the mint request (if applicable).
 */
function showActionModal(action, requestId) {
    const modal = document.getElementById('actionModal');
    const titleEl = document.getElementById('modalTitle');
    const textEl = document.getElementById('modalText');
    const confirmBtn = document.getElementById('modalConfirmBtn');

    const config = {
        pause: { title: 'Pause Protocol', text: 'Are you sure you want to pause all protocol operations?', btnText: 'Pause', btnClass: 'btn-decline' },
        resume: { title: 'Resume Protocol', text: 'Are you sure you want to resume all protocol operations?', btnText: 'Resume', btnClass: 'btn-approve' },
        approve: { title: 'Approve Request', text: 'Are you sure you want to approve this mint request?', btnText: 'Approve', btnClass: 'btn-approve' },
        decline: { title: 'Decline Request', text: 'Are you sure you want to decline this mint request?', btnText: 'Decline', btnClass: 'btn-decline' }
    };

    const actionConfig = config[action];
    titleEl.textContent = actionConfig.title;
    textEl.textContent = actionConfig.text;
    confirmBtn.textContent = actionConfig.btnText;
    confirmBtn.className = `btn modal-btn ${actionConfig.btnClass}`;
    
    modal.classList.add('show');

    // Use a one-time event listener for confirmation
    confirmBtn.onclick = () => {
        modal.classList.remove('show');
        handleConfirm(action, requestId);
    };
}

/**
 * Handles the confirmation of an action from the modal.
 * @param {string} action - The action type.
 * @param {string} [requestId] - The ID of the mint request.
 */
function handleConfirm(action, requestId) {
    switch (action) {
        case 'approve': executeApprove(requestId); break;
        case 'decline': executeDecline(requestId); break;
        case 'pause': executePause(); break;
        case 'resume': executeResume(); break;
    }
}

/**
 * Executes the approval of a mint request.
 * @param {string} requestId - The ID of the mint request.
 */
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

/**
 * Executes the decline of a mint request.
 * @param {string} requestId - The ID of the mint request.
 */
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

/**
 * Executes pausing the protocol.
 */
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

/**
 * Executes resuming the protocol.
 */
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
    
    // Setup Event Listeners
    document.getElementById('logoutBtn').addEventListener('click', logoutUser);
    document.getElementById('refreshBtn').addEventListener('click', refreshAllData);
    document.getElementById('pauseBtn').addEventListener('click', () => showActionModal('pause'));
    document.getElementById('resumeBtn').addEventListener('click', () => showActionModal('resume'));
    document.getElementById('modalCancelBtn').addEventListener('click', () => {
        document.getElementById('actionModal').classList.remove('show');
    });

    // Event delegation for dynamically created buttons in the table
    document.getElementById('requestsTableBody').addEventListener('click', (event) => {
        const button = event.target.closest('button.btn-action');
        if (button) {
            const { action, requestId } = button.dataset;
            if (action && requestId) {
                showActionModal(action, requestId);
            }
        }
    });

    // Initial data load
    refreshAllData();
});
