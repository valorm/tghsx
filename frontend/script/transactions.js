/**
 * ==================================================================================
 * Transaction History Page Logic (transactions.js)
 *
 * Fetches and displays user transaction history with server-side pagination.
 * Updated to correctly parse event data from the new multi-collateral contract events.
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
    currentFilter: 'all',
};

const elements = {
    tableBody: document.getElementById('transactionTableBody'),
    recordCount: document.getElementById('recordCount'),
    pageInfo: document.getElementById('pageInfo'),
    prevPageBtn: document.getElementById('prevPageBtn'),
    nextPageBtn: document.getElementById('nextPageBtn'),
    typeFilter: document.getElementById('typeFilter'),
};

async function fetchTransactions(page = 1) {
    if (pageState.isLoading) return;
    pageState.isLoading = true;
    updateView();

    const token = localStorage.getItem('accessToken');
    if (!token) {
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
            throw new Error('Failed to fetch transactions.');
        }

        const data = await response.json();
        pageState.transactions = data.transactions.map(tx => formatTransaction(tx));
        pageState.totalRecords = data.total || 0;
        pageState.totalPages = Math.ceil(pageState.totalRecords / recordsPerPage) || 1;
        pageState.currentPage = page;

    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        pageState.isLoading = false;
        updateView();
    }
}

function updateView() {
    if (pageState.isLoading) renderLoadingSkeleton();
    else if (pageState.transactions.length === 0) renderEmptyState();
    else renderTablePage();
    updatePaginationUI();
}

function renderLoadingSkeleton() {
    elements.tableBody.innerHTML = Array(recordsPerPage).fill('<tr>' + '<td><div class="skeleton"></div></td>'.repeat(5) + '</tr>').join('');
}

function renderEmptyState() {
    elements.tableBody.innerHTML = `<tr><td colspan="5" class="empty-state">No transactions found for this filter.</td></tr>`;
}

function renderTablePage() {
    elements.tableBody.innerHTML = pageState.transactions.map(tx => `
        <tr>
            <td data-label="Tx Hash"><a href="https://amoy.polygonscan.com/tx/${tx.fullHash}" target="_blank" class="hash-link" title="${tx.fullHash}">${tx.hash}</a></td>
            <td data-label="Method"><span class="method-badge ${tx.badgeClass}">${tx.method}</span></td>
            <td data-label="Date & Time">${new Date(tx.datetime).toLocaleString()}</td>
            <td data-label="Details">${tx.details}</td>
            <td data-label="Amount" class="${tx.amountClass}">${tx.amount}</td>
        </tr>
    `).join('');
}

function updatePaginationUI() {
    elements.pageInfo.textContent = `Page ${pageState.currentPage} of ${pageState.totalPages}`;
    elements.recordCount.textContent = `Total ${pageState.totalRecords} records`;
    elements.prevPageBtn.disabled = pageState.currentPage === 1;
    elements.nextPageBtn.disabled = pageState.currentPage >= pageState.totalPages;
}

function formatTransaction(tx) {
    const eventData = JSON.parse(tx.event_data);
    let details = '', amount = '', amountClass = '', method = tx.event_name, badgeClass = '';

    // FIX: Correctly parse event data based on the new multi-collateral contract events
    const collateralInfo = appState.supportedCollaterals.find(c => c.address.toLowerCase() === eventData.collateral?.toLowerCase());
    const symbol = collateralInfo ? collateralInfo.symbol : 'TOKEN';
    const collateralDecimals = collateralInfo ? collateralInfo.decimals : 18;

    switch(tx.event_name) {
        case 'CollateralDeposited':
            method = 'Deposit';
            badgeClass = 'deposit';
            amount = `+ ${parseFloat(ethers.utils.formatUnits(eventData.amount, collateralDecimals)).toFixed(4)} ${symbol}`;
            amountClass = 'amount-positive';
            details = `Deposited ${symbol}`;
            break;
        case 'CollateralWithdrawn':
            method = 'Withdraw';
            badgeClass = 'withdraw';
            amount = `- ${parseFloat(ethers.utils.formatUnits(eventData.amount, collateralDecimals)).toFixed(4)} ${symbol}`;
            amountClass = 'amount-negative';
            details = `Withdrew ${symbol}`;
            break;
        case 'TokensMinted':
            method = 'Mint';
            badgeClass = 'mint';
            amount = `+ ${parseFloat(ethers.utils.formatUnits(eventData.amount, 6)).toFixed(2)} tGHSX`;
            amountClass = 'amount-positive';
            details = `Against ${symbol} collateral`;
            break;
        case 'TokensBurned':
            method = 'Burn (Repay)';
            badgeClass = 'repay';
            amount = `- ${parseFloat(ethers.utils.formatUnits(eventData.amount, 6)).toFixed(2)} tGHSX`;
            amountClass = 'amount-negative';
            details = `For ${symbol} position`;
            break;
        case 'PositionLiquidated':
            method = 'Liquidation';
            badgeClass = 'liquidate';
            amount = `- ${parseFloat(ethers.utils.formatUnits(eventData.debtAmount, 6)).toFixed(2)} tGHSX`;
            amountClass = 'amount-negative';
            details = `Liquidated position of ${formatAddress(eventData.user)}`;
            break;
        default:
            method = tx.event_name;
            details = 'N/A';
            amount = 'N/A';
    }

    return {
        hash: formatAddress(tx.tx_hash),
        fullHash: tx.tx_hash,
        method, badgeClass, details, amount, amountClass,
        datetime: tx.block_timestamp,
    };
}

document.addEventListener('DOMContentLoaded', () => {
    elements.prevPageBtn.addEventListener('click', () => fetchTransactions(pageState.currentPage - 1));
    elements.nextPageBtn.addEventListener('click', () => fetchTransactions(pageState.currentPage + 1));
    elements.typeFilter.addEventListener('change', (e) => {
        pageState.currentFilter = e.target.value;
        fetchTransactions(1);
    });

    document.addEventListener('networkConnected', () => fetchTransactions(1));
    if (appState.isCorrectNetwork) fetchTransactions(1);
});
