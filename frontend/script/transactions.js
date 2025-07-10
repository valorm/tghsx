/**
 * ==================================================================================
 * Transaction History Page Logic (transactions.js) - OPTIMIZED
 *
 * Fetches, displays, filters, and exports user transaction history with optimizations:
 * - Server-side pagination for improved performance.
 * - UI states for loading (skeleton), error, and empty content.
 * - Refactored code for better maintainability.
 * Relies on shared-wallet.js for authentication and wallet state.
 * ==================================================================================
 */

import { appState, logoutUser, formatAddress, showToast, BACKEND_URL } from './shared-wallet.js';

const recordsPerPage = 10;

let pageState = {
    transactions: [],
    currentPage: 1,
    totalPages: 1,
    totalRecords: 0,
    isLoading: false,
    error: null,
    currentFilter: 'all',
};

const elements = {
    tableBody: document.getElementById('transactionTableBody'),
    recordCount: document.getElementById('recordCount'),
    pageInfo: document.getElementById('pageInfo'),
    prevPageBtn: document.getElementById('prevPageBtn'),
    nextPageBtn: document.getElementById('nextPageBtn'),
    typeFilter: document.getElementById('typeFilter'),
    exportBtn: document.getElementById('exportBtn'),
};

async function fetchTransactions(page = 1) {
    if (pageState.isLoading) return;

    pageState.isLoading = true;
    pageState.error = null;
    updateView();

    const token = localStorage.getItem('accessToken');
    if (!token) {
        pageState.error = 'Authentication error. Please log in again.';
        pageState.isLoading = false;
        updateView();
        return;
    }

    try {
        const response = await fetch(`${BACKEND_URL}/transactions/?page=${page}&limit=${recordsPerPage}&type=${pageState.currentFilter}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            if (response.status === 401) logoutUser();
            throw new Error('Failed to fetch transactions from the server.');
        }

        const data = await response.json();
        pageState.transactions = (data.transactions || []).map(tx => formatTransaction(tx));
        pageState.totalRecords = data.total || 0;
        pageState.totalPages = Math.ceil(pageState.totalRecords / recordsPerPage);
        pageState.currentPage = page;

    } catch (error) {
        console.error('Error fetching transactions:', error);
        pageState.error = error.message;
        pageState.transactions = [];
    } finally {
        pageState.isLoading = false;
        updateView();
    }
}

function updateView() {
    if (pageState.isLoading) {
        renderLoadingSkeleton();
    } else if (pageState.error) {
        renderErrorState(pageState.error);
    } else if (pageState.transactions.length === 0) {
        renderEmptyState();
    } else {
        renderTablePage();
    }
    updatePaginationUI();
}

function renderLoadingSkeleton() {
    elements.tableBody.innerHTML = '';
    for (let i = 0; i < recordsPerPage; i++) {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><div class="skeleton skeleton-text"></div></td>
            <td><div class="skeleton skeleton-text"></div></td>
            <td><div class="skeleton skeleton-text"></div></td>
            <td><div class="skeleton skeleton-text"></div></td>
            <td><div class="skeleton skeleton-text"></div></td>
            <td><div class="skeleton skeleton-text"></div></td>
        `;
        elements.tableBody.appendChild(row);
    }
    elements.recordCount.innerHTML = '<span>Loading...</span>';
}

function renderErrorState(message) {
    elements.tableBody.innerHTML = `
        <tr>
            <td colspan="6">
                <div class="error-state">
                    <h3><i class="fas fa-exclamation-triangle"></i> Oops! Something went wrong.</h3>
                    <p>${message}</p>
                    <button id="retryBtn" class="btn-retry">Try Again</button>
                </div>
            </td>
        </tr>`;
    document.getElementById('retryBtn').addEventListener('click', () => fetchTransactions(1));
}

function renderEmptyState() {
    elements.tableBody.innerHTML = `
        <tr>
            <td colspan="6">
                <div class="empty-state">
                    <h3>No transactions found</h3>
                    <p>Your transaction history for the selected filter will appear here.</p>
                </div>
            </td>
        </tr>`;
}

function renderTablePage() {
    elements.tableBody.innerHTML = '';
    pageState.transactions.forEach(tx => {
        const row = document.createElement('tr');
        const badgeClass = getMethodBadgeClass(tx.method);
        row.innerHTML = `
            <td data-label="Tx Hash"><a href="https://amoy.polygonscan.com/tx/${tx.fullHash}" target="_blank" class="hash-link" title="${tx.fullHash}">${tx.hash}</a></td>
            <td data-label="Method"><span class="method-badge ${badgeClass}">${tx.method}</span></td>
            <td data-label="Date & Time">${new Date(tx.datetime).toLocaleString()}</td>
            <td data-label="From">${tx.from}</td>
            <td data-label="To"><span class="direction-indicator ${tx.direction.toLowerCase()}">${tx.direction}</span> ${tx.to}</td>
            <td data-label="Amount" class="${tx.value >= 0 ? 'amount-positive' : 'amount-negative'}">${tx.amount}</td>
        `;
        elements.tableBody.appendChild(row);
    });
}

function updatePaginationUI() {
    elements.pageInfo.textContent = `Page ${pageState.currentPage} of ${pageState.totalPages || 1}`;
    elements.recordCount.innerHTML = `<span>Total ${pageState.totalRecords} records</span>`;
    elements.prevPageBtn.disabled = pageState.currentPage === 1 || pageState.isLoading;
    elements.nextPageBtn.disabled = pageState.currentPage >= pageState.totalPages || pageState.isLoading;
    elements.exportBtn.disabled = pageState.transactions.length === 0 || pageState.isLoading;
}

function formatTransaction(tx) {
    const eventData = JSON.parse(tx.event_data);
    const userAddressShort = eventData.user ? formatAddress(eventData.user) : 'N/A';
    let amount, value, method = 'Unknown', direction = '', from = 'N/A', to = 'N/A', amountStr = '';
    
    switch(tx.event_name) {
        case 'CollateralDeposited':
            method = 'Deposit Collateral';
            amount = ethers.utils.formatEther(eventData.amount);
            value = -parseFloat(amount);
            amountStr = `-${parseFloat(amount).toFixed(4)} ETH`;
            direction = 'Out'; from = userAddressShort; to = 'Vault';
            break;
        case 'TGHSXMinted':
            method = 'Mint tGHSX';
            amount = ethers.utils.formatEther(eventData.amount);
            value = parseFloat(amount);
            amountStr = `+${parseFloat(amount).toFixed(2)} tGHSX`;
            direction = 'In'; from = 'Vault'; to = userAddressShort;
            break;
        case 'TGHSXBurned':
            method = 'Repay Debt';
            amount = ethers.utils.formatEther(eventData.amount);
            value = -parseFloat(amount);
            amountStr = `-${parseFloat(amount).toFixed(2)} tGHSX`;
            direction = 'Out'; from = userAddressShort; to = 'Vault';
            break;
        case 'CollateralWithdrawn':
            method = 'Withdraw Collateral';
            amount = ethers.utils.formatEther(eventData.amount);
            value = parseFloat(amount);
            amountStr = `+${parseFloat(amount).toFixed(4)} ETH`;
            direction = 'In'; from = 'Vault'; to = userAddressShort;
            break;
    }

    return {
        hash: formatAddress(tx.tx_hash), fullHash: tx.tx_hash,
        method, datetime: tx.block_timestamp, from, to, amount: amountStr, value, direction
    };
}

function getMethodBadgeClass(method) {
    if (method.includes('Deposit')) return 'withdraw';
    if (method.includes('Withdraw')) return 'deposit';
    if (method.includes('Mint')) return 'mint';
    if (method.includes('Repay')) return 'repay';
    return '';
}

function exportToCSV() {
    if (pageState.transactions.length === 0) {
        showToast("No data to export.", "info");
        return;
    }
    const headers = ["Transaction Hash", "Method", "Date & Time", "From", "To", "Amount"];
    const rows = pageState.transactions.map(tx => [
        `"${tx.fullHash}"`, `"${tx.method}"`, `"${new Date(tx.datetime).toLocaleString()}"`,
        `"${tx.from}"`, `"${tx.to}"`, `"${tx.amount.replace(/,/g, '')}"`
    ]);

    const csvContent = "data:text/csv;charset=utf-8," 
        + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `tghsx_transactions_page_${pageState.currentPage}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function handleFilterChange(event) {
    pageState.currentFilter = event.target.value;
    fetchTransactions(1);
}

document.addEventListener('DOMContentLoaded', () => {
    elements.prevPageBtn.addEventListener('click', () => fetchTransactions(pageState.currentPage - 1));
    elements.nextPageBtn.addEventListener('click', () => fetchTransactions(pageState.currentPage + 1));
    elements.typeFilter.addEventListener('change', handleFilterChange);
    elements.exportBtn.addEventListener('click', exportToCSV);

    document.addEventListener('networkConnected', () => fetchTransactions(1));
    document.addEventListener('walletDisconnected', () => {
        pageState = { ...pageState, transactions: [], totalRecords: 0, totalPages: 1, currentPage: 1, error: null };
        updateView();
    });
    
    updateView();
});
