/**
 * ==================================================================================
 * Admin Dashboard Logic (admin.js) - Enhanced Version with Bug Fixes
 *
 * Manages the admin dashboard, including fetching pending mint requests,
 * controlling protocol status, and handling admin actions like updating prices
 * and configuration.
 * 
 * FIXES APPLIED:
 * - Fixed sanitizeInput function to handle null/undefined values
 * - Added proper element existence checks
 * - Enhanced error handling for missing DOM elements
 * - Improved validation with fallback values
 * ==================================================================================
 */

import { BACKEND_URL, showToast, logoutUser } from './shared-wallet.js';

let currentToken = null;
let refreshInterval = null;
const REFRESH_INTERVAL_MS = 30000; // 30 seconds auto-refresh

// Enhanced API call with retry logic
async function apiCall(endpoint, options = {}, retries = 3) {
    const headers = {
        'Authorization': `Bearer ${currentToken}`,
        'Content-Type': 'application/json',
        ...options.headers,
    };
    
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const response = await fetch(`${BACKEND_URL}${endpoint}`, { 
                ...options, 
                headers,
                signal: AbortSignal.timeout(10000) // 10 second timeout
            });
            
            if (response.status === 401 || response.status === 403) {
                showToast('Session expired. Please login again.', 'error');
                setTimeout(() => logoutUser(), 1500);
                throw new Error('Unauthorized');
            }

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ 
                    detail: `HTTP ${response.status}: ${response.statusText}` 
                }));
                throw new Error(errorData.detail || 'Network error occurred');
            }
            
            return response.status === 204 ? {} : response.json();
            
        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error('Request timeout - please try again');
            }
            
            if (attempt === retries) {
                throw error;
            }
            
            // Exponential backoff for retries
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
    }
}

// FIXED: Enhanced input validation utilities with proper null/undefined handling
const validation = {
    isValidPrice: (value) => {
        if (value === null || value === undefined || value === '') return false;
        const num = parseFloat(value);
        return !isNaN(num) && num > 0 && num < 1000000; // Reasonable price range
    },
    
    isValidThreshold: (value) => {
        if (value === null || value === undefined || value === '') return false;
        const num = parseInt(value);
        return !isNaN(num) && num > 0 && num <= 86400; // Max 24 hours
    },
    
    // FIXED: Proper handling of null/undefined values
    sanitizeInput: (input) => {
        if (input === null || input === undefined) {
            return '';
        }
        
        // Convert to string safely
        const str = typeof input === 'string' ? input : String(input);
        return str.trim().replace(/[<>]/g, '');
    }
};

// Enhanced number formatting with locale support
function formatNumber(numStr) {
    if (numStr === null || numStr === undefined || numStr === '') return 'N/A';
    
    const num = parseFloat(numStr);
    if (isNaN(num)) return 'N/A';
    
    // Format based on magnitude
    if (num >= 1000000) {
        return (num / 1000000).toFixed(2) + 'M';
    } else if (num >= 1000) {
        return (num / 1000).toFixed(2) + 'K';
    }
    
    return num.toLocaleString('en-US', { 
        minimumFractionDigits: 2, 
        maximumFractionDigits: 4 
    });
}

function truncate(str, len = 12) {
    if (!str || str.length <= len) return str || '';
    return `${str.slice(0, len)}...`;
}

// Enhanced time formatting with more granular options
function timeAgo(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Invalid Date';
    
    const seconds = Math.floor((new Date() - date) / 1000);
    if (seconds < 5) return "just now";
    
    const intervals = [
        { label: 'year', seconds: 31536000 },
        { label: 'month', seconds: 2592000 },
        { label: 'week', seconds: 604800 },
        { label: 'day', seconds: 86400 },
        { label: 'hour', seconds: 3600 },
        { label: 'minute', seconds: 60 }
    ];
    
    for (const interval of intervals) {
        const count = Math.floor(seconds / interval.seconds);
        if (count >= 1) {
            return `${count} ${interval.label}${count > 1 ? 's' : ''} ago`;
        }
    }
    
    return `${seconds} second${seconds > 1 ? 's' : ''} ago`;
}

// Enhanced status fetching with better error handling
async function fetchContractStatus() {
    try {
        const data = await apiCall('/admin/status');
        updateStatusDisplay(data);
        
        // Store last successful fetch time
        localStorage.setItem('lastStatusFetch', new Date().toISOString());
        
    } catch (error) {
        if (error.message !== 'Unauthorized') {
            showToast(`Status fetch failed: ${error.message}`, 'error');
            handleStatusFetchError();
        }
    }
}

function updateStatusDisplay(data) {
    const statusEl = document.getElementById('contractStatus');
    const pauseBtn = document.getElementById('pauseBtn');
    const resumeBtn = document.getElementById('resumeBtn');

    if (data.isPaused) {
        statusEl.innerHTML = `<span class="status-badge paused" role="status" aria-label="Protocol paused">PAUSED</span>`;
        if (pauseBtn) pauseBtn.disabled = true;
        if (resumeBtn) resumeBtn.disabled = false;
    } else {
        statusEl.innerHTML = `<span class="status-badge active" role="status" aria-label="Protocol active">ACTIVE</span>`;
        if (pauseBtn) pauseBtn.disabled = false;
        if (resumeBtn) resumeBtn.disabled = true;
    }
    
    // Update price feed information with validation
    const ethFeedEl = document.getElementById('ethUsdFeed');
    const ghsPriceEl = document.getElementById('currentGhsPrice');
    const thresholdEl = document.getElementById('currentStalenessThreshold');
    
    if (ethFeedEl) ethFeedEl.textContent = data.ethUsdPriceFeed || 'N/A';
    if (ghsPriceEl) ghsPriceEl.textContent = data.ghsUsdPrice ? `GH₵ ${formatNumber(data.ghsUsdPrice)}` : 'N/A';
    if (thresholdEl) thresholdEl.textContent = data.priceStalenessThreshold ? `${data.priceStalenessThreshold} seconds` : 'N/A';
}

function handleStatusFetchError() {
    const statusEl = document.getElementById('contractStatus');
    if (statusEl) {
        statusEl.innerHTML = `<span class="status-badge error" role="status" aria-label="Status unknown">ERROR</span>`;
    }
}

// Enhanced pending requests fetching with better loading states
async function fetchPendingRequests() {
    const elements = {
        loading: document.getElementById('loadingState'),
        empty: document.getElementById('emptyState'),
        table: document.getElementById('requestsTable'),
        tableBody: document.getElementById('requestsTableBody'),
        count: document.getElementById('requestCount')
    };

    // Show loading state
    elements.loading?.classList.remove('hidden');
    elements.empty?.classList.add('hidden');
    if (elements.table) elements.table.style.display = 'none';
    if (elements.tableBody) elements.tableBody.innerHTML = '';

    try {
        const requests = await apiCall('/mint/admin/pending-requests');
        
        // Update request count with animation
        if (elements.count) {
            elements.count.textContent = `${requests.length} Pending`;
            elements.count.setAttribute('aria-label', `${requests.length} pending requests`);
        }

        if (requests.length === 0) {
            elements.empty?.classList.remove('hidden');
        } else {
            populateRequestsTable(requests, elements.tableBody);
            if (elements.table) elements.table.style.display = 'table';
        }
        
    } catch (error) {
        if (error.message !== 'Unauthorized') {
            showToast(`Failed to load requests: ${error.message}`, 'error');
            handleRequestsFetchError(elements);
        }
    } finally {
        elements.loading?.classList.add('hidden');
    }
}

function populateRequestsTable(requests, tableBody) {
    if (!tableBody) return;
    
    requests.forEach((req, index) => {
        const row = tableBody.insertRow();
        row.setAttribute('data-request-id', req.id);
        row.innerHTML = `
            <td data-label="Submitted">
                <span class="tooltip" 
                      title="${new Date(req.created_at).toLocaleString()}"
                      aria-label="Submitted ${timeAgo(req.created_at)}">
                    ${timeAgo(req.created_at)}
                </span>
            </td>
            <td data-label="User ID">
                <span class="tooltip address" 
                      title="${req.user_id}"
                      aria-label="User ID ${req.user_id}">
                    ${truncate(req.user_id)}
                </span>
            </td>
            <td data-label="Collateral (ETH)" aria-label="Collateral ${formatNumber(req.collateral_amount)} ETH">
                ${formatNumber(req.collateral_amount)}
            </td>
            <td data-label="Mint Amount (tGHSX)" aria-label="Mint amount ${formatNumber(req.mint_amount)} tGHSX">
                ${formatNumber(req.mint_amount)}
            </td>
            <td data-label="Ratio (%)" aria-label="Collateral ratio ${parseFloat(req.collateral_ratio).toFixed(2)}%">
                ${parseFloat(req.collateral_ratio).toFixed(2)}%
            </td>
            <td data-label="Actions">
                <button class="btn btn-action btn-approve" 
                        data-action="approve" 
                        data-request-id="${req.id}"
                        aria-label="Approve request ${index + 1}">
                    Approve
                </button>
                <button class="btn btn-action btn-decline" 
                        data-action="decline" 
                        data-request-id="${req.id}"
                        aria-label="Decline request ${index + 1}">
                    Decline
                </button>
            </td>
        `;
    });
}

function handleRequestsFetchError(elements) {
    if (elements.tableBody) {
        elements.tableBody.innerHTML = `
            <tr><td colspan="6" class="error-message">
                Failed to load requests. Please try refreshing.
            </td></tr>
        `;
    }
}

// Enhanced refresh functionality with better feedback
async function refreshAllData() {
    const refreshButton = document.getElementById('refreshBtn');
    if (!refreshButton) return;
    
    const originalContent = refreshButton.innerHTML;
    refreshButton.disabled = true;
    refreshButton.innerHTML = `<span class="loading-indicator" aria-hidden="true"></span> Refreshing...`;
    refreshButton.setAttribute('aria-label', 'Refreshing dashboard data');

    try {
        await Promise.all([
            fetchContractStatus(),
            fetchPendingRequests()
        ]);
        
        showToast('Dashboard refreshed successfully.', 'success');
        
        // Update last refresh time
        const now = new Date().toLocaleString();
        const lastRefreshEl = document.getElementById('lastRefresh');
        if (lastRefreshEl) lastRefreshEl.textContent = `Last updated: ${now}`;
        
    } catch (error) {
        if (error.message !== 'Unauthorized') {
            showToast('Refresh failed. Some data may be outdated.', 'error');
        }
    } finally {
        refreshButton.disabled = false;
        refreshButton.innerHTML = originalContent;
        refreshButton.setAttribute('aria-label', 'Refresh dashboard data');
    }
}

// FIXED: Enhanced modal functionality with proper null checking
function showActionModal(action, value) {
    const modal = document.getElementById('actionModal');
    const titleEl = document.getElementById('modalTitle');
    const textEl = document.getElementById('modalText');
    const confirmBtn = document.getElementById('modalConfirmBtn');
    
    if (!modal || !titleEl || !textEl || !confirmBtn) {
        console.warn('Modal elements not found');
        return;
    }

    const config = {
        pause: { 
            title: 'Pause Protocol', 
            text: 'This will stop all protocol operations. Users will not be able to mint or redeem tokens.', 
            btnText: 'Pause Protocol', 
            btnClass: 'btn-decline' 
        },
        resume: { 
            title: 'Resume Protocol', 
            text: 'This will restore all protocol operations. Users will be able to mint and redeem tokens.', 
            btnText: 'Resume Protocol', 
            btnClass: 'btn-approve' 
        },
        approve: { 
            title: 'Approve Mint Request', 
            text: 'This will process the mint request and issue tokens to the user.', 
            btnText: 'Approve Request', 
            btnClass: 'btn-approve' 
        },
        decline: { 
            title: 'Decline Mint Request', 
            text: 'This will reject the mint request and return collateral to the user.', 
            btnText: 'Decline Request', 
            btnClass: 'btn-decline' 
        },
        updatePrice: { 
            title: 'Update GHS Price', 
            text: `Set the GHS/USD price to ${validation.sanitizeInput(value)}? This will affect all future calculations.`, 
            btnText: 'Update Price', 
            btnClass: 'btn-primary' 
        },
        updateThreshold: { 
            title: 'Update Staleness Threshold', 
            text: `Set the price staleness threshold to ${validation.sanitizeInput(value)} seconds? This affects price feed validation.`, 
            btnText: 'Update Threshold', 
            btnClass: 'btn-primary' 
        }
    };

    const actionConfig = config[action];
    if (!actionConfig) {
        console.warn(`Unknown action: ${action}`);
        return;
    }
    
    titleEl.textContent = actionConfig.title;
    textEl.textContent = actionConfig.text;
    confirmBtn.textContent = actionConfig.btnText;
    confirmBtn.className = `btn modal-btn ${actionConfig.btnClass}`;
    
    // Enhanced accessibility
    modal.setAttribute('aria-labelledby', 'modalTitle');
    modal.setAttribute('aria-describedby', 'modalText');
    modal.classList.add('show');
    
    // Focus management
    confirmBtn.focus();
    
    // Enhanced confirm handler
    confirmBtn.onclick = () => {
        modal.classList.remove('show');
        handleConfirm(action, value);
    };
    
    // Enhanced keyboard navigation
    modal.addEventListener('keydown', handleModalKeydown);
}

function handleModalKeydown(event) {
    if (event.key === 'Escape') {
        const modal = document.getElementById('actionModal');
        if (modal) modal.classList.remove('show');
    }
}

function handleConfirm(action, value) {
    const actions = {
        approve: () => executeApprove(value),
        decline: () => executeDecline(value),
        pause: () => executePause(),
        resume: () => executeResume(),
        updatePrice: () => executeUpdateGhsPrice(value),
        updateThreshold: () => executeUpdateThreshold(value)
    };
    
    const actionFn = actions[action];
    if (actionFn) {
        actionFn();
    } else {
        console.warn(`Unknown action: ${action}`);
    }
}

// Enhanced price update with validation
async function executeUpdateGhsPrice(newPrice) {
    const btn = document.getElementById('updateGhsPriceBtn');
    if (!btn) {
        console.warn('Update GHS price button not found');
        return;
    }
    
    const sanitizedPrice = validation.sanitizeInput(newPrice);
    
    if (!validation.isValidPrice(sanitizedPrice)) {
        showToast('Invalid price value. Please enter a number between 0 and 1,000,000.', 'error');
        return;
    }
    
    btn.disabled = true;
    const originalText = btn.textContent;
    btn.textContent = 'Updating...';
    
    try {
        await apiCall('/admin/update-ghs-price', { 
            method: 'POST', 
            body: JSON.stringify({ new_price: parseFloat(sanitizedPrice) }) 
        });
        
        showToast(`GHS price updated to ${formatNumber(sanitizedPrice)}!`, 'success');
        const input = document.getElementById('newGhsPriceInput');
        if (input) input.value = '';
        fetchContractStatus();
        
    } catch(error) {
        if (error.message !== 'Unauthorized') {
            showToast(`Price update failed: ${error.message}`, 'error');
        }
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
}

// Enhanced threshold update with validation
async function executeUpdateThreshold(newThreshold) {
    const btn = document.getElementById('updateStalenessThresholdBtn');
    if (!btn) {
        console.warn('Update staleness threshold button not found');
        return;
    }
    
    const sanitizedThreshold = validation.sanitizeInput(newThreshold);
    
    if (!validation.isValidThreshold(sanitizedThreshold)) {
        showToast('Invalid threshold. Please enter a number between 1 and 86400 seconds.', 'error');
        return;
    }
    
    btn.disabled = true;
    const originalText = btn.textContent;
    btn.textContent = 'Updating...';
    
    try {
        await apiCall('/admin/update-staleness-threshold', {
            method: 'POST',
            body: JSON.stringify({ new_threshold: parseInt(sanitizedThreshold) })
        });
        
        showToast(`Staleness threshold updated to ${sanitizedThreshold} seconds!`, 'success');
        const input = document.getElementById('newStalenessThresholdInput');
        if (input) input.value = '';
        fetchContractStatus();
        
    } catch(error) {
        if (error.message !== 'Unauthorized') {
            showToast(`Threshold update failed: ${error.message}`, 'error');
        }
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
}

// Enhanced request processing with better feedback
async function executeApprove(requestId) {
    const button = document.querySelector(`button[data-request-id="${requestId}"][data-action="approve"]`);
    const row = document.querySelector(`tr[data-request-id="${requestId}"]`);
    
    if (button) {
        button.disabled = true;
        button.textContent = 'Processing...';
    }
    
    try {
        await apiCall('/mint/admin/mint', { 
            method: 'POST', 
            body: JSON.stringify({ request_id: requestId }) 
        });
        
        showToast('Request approved and processed successfully!', 'success');
        
        // Visual feedback for successful approval
        if (row) {
            row.classList.add('success-highlight');
            setTimeout(() => row.remove(), 2000);
        }
        
        fetchPendingRequests();
        
    } catch (error) {
        if (error.message !== 'Unauthorized') {
            showToast(`Approval failed: ${error.message}`, 'error');
        }
        
        if (button) {
            button.disabled = false;
            button.textContent = 'Approve';
        }
    }
}

async function executeDecline(requestId) {
    const button = document.querySelector(`button[data-request-id="${requestId}"][data-action="decline"]`);
    const row = document.querySelector(`tr[data-request-id="${requestId}"]`);
    
    if (button) {
        button.disabled = true;
        button.textContent = 'Processing...';
    }
    
    try {
        await apiCall('/mint/admin/decline', { 
            method: 'POST', 
            body: JSON.stringify({ request_id: requestId }) 
        });
        
        showToast('Request declined successfully.', 'success');
        
        // Visual feedback for successful decline
        if (row) {
            row.classList.add('decline-highlight');
            setTimeout(() => row.remove(), 2000);
        }
        
        fetchPendingRequests();
        
    } catch (error) {
        if (error.message !== 'Unauthorized') {
            showToast(`Decline failed: ${error.message}`, 'error');
        }
        
        if (button) {
            button.disabled = false;
            button.textContent = 'Decline';
        }
    }
}

// Enhanced protocol control functions
async function executePause() {
    const btn = document.getElementById('pauseBtn');
    if (!btn) {
        console.warn('Pause button not found');
        return;
    }
    
    btn.disabled = true;
    const originalText = btn.textContent;
    btn.textContent = 'Pausing...';
    
    try {
        await apiCall('/admin/pause', { method: 'POST' });
        showToast('Protocol paused successfully!', 'success');
        fetchContractStatus();
        
    } catch(error) { 
        if (error.message !== 'Unauthorized') {
            showToast(`Pause failed: ${error.message}`, 'error');
        }
        btn.disabled = false;
        btn.textContent = originalText;
    }
}

async function executeResume() {
    const btn = document.getElementById('resumeBtn');
    if (!btn) {
        console.warn('Resume button not found');
        return;
    }
    
    btn.disabled = true;
    const originalText = btn.textContent;
    btn.textContent = 'Resuming...';
    
    try {
        await apiCall('/admin/unpause', { method: 'POST' });
        showToast('Protocol resumed successfully!', 'success');
        fetchContractStatus();
        
    } catch(error) { 
        if (error.message !== 'Unauthorized') {
            showToast(`Resume failed: ${error.message}`, 'error');
        }
        btn.disabled = false;
        btn.textContent = originalText;
    }
}

// Auto-refresh functionality
function startAutoRefresh() {
    if (refreshInterval) clearInterval(refreshInterval);
    
    refreshInterval = setInterval(async () => {
        try {
            await Promise.all([
                fetchContractStatus(),
                fetchPendingRequests()
            ]);
        } catch (error) {
            console.warn('Auto-refresh failed:', error.message);
        }
    }, REFRESH_INTERVAL_MS);
}

function stopAutoRefresh() {
    if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
    }
}

// FIXED: Enhanced initialization with proper element checking
document.addEventListener('DOMContentLoaded', () => {
    currentToken = localStorage.getItem('accessToken');
    
    if (!currentToken) {
        logoutUser();
        return;
    }
    
    // FIXED: Enhanced event listeners with proper error handling
    const addEventListenerSafely = (id, event, handler) => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener(event, handler);
        } else {
            console.warn(`Element with id '${id}' not found`);
        }
    };
    
    // Core navigation and refresh
    addEventListenerSafely('logoutBtn', 'click', logoutUser);
    addEventListenerSafely('refreshBtn', 'click', refreshAllData);
    
    // Protocol control
    addEventListenerSafely('pauseBtn', 'click', () => showActionModal('pause'));
    addEventListenerSafely('resumeBtn', 'click', () => showActionModal('resume'));
    
    // Modal control
    addEventListenerSafely('modalCancelBtn', 'click', () => {
        const modal = document.getElementById('actionModal');
        if (modal) modal.classList.remove('show');
    });

    // Enhanced price update handler
    addEventListenerSafely('updateGhsPriceBtn', 'click', () => {
        const input = document.getElementById('newGhsPriceInput');
        if (!input) {
            console.warn('GHS price input not found');
            return;
        }
        
        const newPrice = input.value ? input.value.trim() : '';
        if (!validation.isValidPrice(newPrice)) {
            showToast('Please enter a valid positive number for the price.', 'error');
            input.focus();
            return;
        }
        showActionModal('updatePrice', newPrice);
    });

    // FIXED: Enhanced threshold update handler with better error handling
    addEventListenerSafely('updateStalenessThresholdBtn', 'click', () => {
        const input = document.getElementById('newStalenessThresholdInput');
        if (!input) {
            console.warn('Staleness threshold input not found');
            return;
        }
        
        const newThreshold = input.value ? input.value.trim() : '';
        if (!validation.isValidThreshold(newThreshold)) {
            showToast('Please enter a valid positive integer for the threshold (1-86400 seconds).', 'error');
            input.focus();
            return;
        }
        showActionModal('updateThreshold', newThreshold);
    });

    // Enhanced table event delegation
    const tableBody = document.getElementById('requestsTableBody');
    if (tableBody) {
        tableBody.addEventListener('click', (event) => {
            const button = event.target.closest('button.btn-action');
            if (button && !button.disabled) {
                const { action, requestId } = button.dataset;
                if (action && requestId) {
                    showActionModal(action, requestId);
                }
            }
        });
    }

    // Handle page visibility changes
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            stopAutoRefresh();
        } else {
            startAutoRefresh();
            refreshAllData(); // Refresh when page becomes visible
        }
    });

    // Initialize dashboard
    refreshAllData();
    startAutoRefresh();
    
    // Handle beforeunload
    window.addEventListener('beforeunload', () => {
        stopAutoRefresh();
    });
});