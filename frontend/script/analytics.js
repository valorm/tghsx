/**
 * ==================================================================================
 * Analytics Page Logic (analytics.js)
 *
 * Fetches protocol health data from the updated backend endpoint and renders it.
 * ==================================================================================
 */

import { logoutUser, BACKEND_URL } from './shared-wallet.js';

function formatCurrency(value, currency = '$') {
    const num = parseFloat(value);
    if (isNaN(num)) return 'N/A';
    if (num >= 1_000_000) return `${currency}${(num / 1_000_000).toFixed(2)}M`;
    if (num >= 1_000) return `${currency}${(num / 1_000).toFixed(1)}K`;
    return `${currency}${num.toFixed(2)}`;
}

async function fetchAnalyticsData() {
    const loadingElements = document.querySelectorAll('.stat-value');
    loadingElements.forEach(el => el.textContent = 'Loading...');

    try {
        const token = localStorage.getItem('accessToken');
        if (!token) {
            throw new Error('Please log in to view analytics.');
        }

        const response = await fetch(`${BACKEND_URL}/protocol/health`, {
             headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            if (response.status === 401) logoutUser();
            throw new Error('Failed to fetch protocol health data');
        }
        
        const data = await response.json();
        
        // FIX: Use the new data keys from the updated backend response
        document.getElementById('tvlValue').textContent = formatCurrency(data.totalValueLockedUSD, '$');
        document.getElementById('totalDebt').textContent = `${formatCurrency(data.totalDebt, '')} tGHSX`;
        document.getElementById('collateralTypes').textContent = data.numberOfCollateralTypes;
        document.getElementById('globalRatio').textContent = `${parseFloat(data.globalCollateralizationRatio).toFixed(2)}%`;

        // Mock data for charts, as backend doesn't provide historical data yet
        // In a real app, this data would come from another API endpoint.
        const labels = ['6 days ago', '5 days ago', '4 days ago', '3 days ago', '2 days ago', 'Yesterday', 'Today'];
        const tvlHistory = [10000, 25000, 40000, 30000, 55000, 70000, parseFloat(data.totalValueLockedUSD)];
        const debtHistory = [5000, 12000, 20000, 15000, 28000, 35000, parseFloat(data.totalDebt)];

        renderChart('tvlChart', 'TVL (USD)', labels, tvlHistory, '#3FB950');
        renderChart('debtChart', 'Debt (tGHSX)', labels, debtHistory, 'var(--accent-primary)');

    } catch (error) {
        console.error('Error fetching analytics:', error);
        loadingElements.forEach(el => el.textContent = 'Error');
        showToast(error.message, 'error');
    }
}

function renderChart(canvasId, label, labels, data, color) {
    const ctx = document.getElementById(canvasId)?.getContext('2d');
    if (!ctx) return;

    // Destroy previous chart instance if it exists
    if (window.chartInstances && window.chartInstances[canvasId]) {
        window.chartInstances[canvasId].destroy();
    }
    
    const chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: label,
                data: data,
                borderColor: color,
                backgroundColor: `${color}33`,
                fill: true,
                tension: 0.4,
                pointBackgroundColor: color,
                pointRadius: 4,
                pointHoverRadius: 6,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { 
                    beginAtZero: true, 
                    ticks: { color: 'var(--text-secondary)' }, 
                    grid: { color: 'var(--border-color)' } 
                },
                x: { 
                    ticks: { color: 'var(--text-secondary)' }, 
                    grid: { display: false } 
                }
            },
            plugins: { 
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(0,0,0,0.7)',
                    titleFont: { size: 14 },
                    bodyFont: { size: 12 },
                    padding: 10,
                    cornerRadius: 4,
                }
            }
        }
    });

    if (!window.chartInstances) window.chartInstances = {};
    window.chartInstances[canvasId] = chart;
}

// Ensure shared-wallet logic has run and established a connection before fetching
document.addEventListener('networkConnected', fetchAnalyticsData);

// Also fetch if the page is loaded and already connected
document.addEventListener('DOMContentLoaded', () => {
    if (appState.isCorrectNetwork) {
        fetchAnalyticsData();
    }
});
