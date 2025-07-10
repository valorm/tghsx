/**
 * ==================================================================================
 * Analytics Page Logic (analytics.js)
 *
 * Fetches protocol health data from the backend and renders it using Chart.js.
 * Relies on shared-wallet.js for authentication and wallet state.
 * ==================================================================================
 */

/**
 * Formats a number into a currency string with abbreviations (K, M).
 * @param {number|string} value - The numerical value.
 * @param {string} currency - The currency symbol (e.g., 'ETH ', 'tGHSX ').
 * @returns {string} - The formatted currency string.
 */
function formatCurrency(value, currency = 'GH₵') {
    const num = parseFloat(value);
    if (isNaN(num)) return 'N/A';
    if (num >= 1_000_000) return `${currency}${(num / 1_000_000).toFixed(2)}M`;
    if (num >= 1_000) return `${currency}${(num / 1_000).toFixed(1)}K`;
    return `${currency}${num.toFixed(2)}`;
}

/**
 * Fetches analytics data from the backend and updates the UI.
 */
async function fetchAnalyticsData() {
    try {
        const token = localStorage.getItem('accessToken');
        if (!token) {
            document.getElementById('tvlValue').textContent = 'Please log in';
            return;
        }

        const response = await fetch(`${BACKEND_URL}/protocol/health`, {
             headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            if (response.status === 401) logoutUser(); // from shared-wallet.js
            throw new Error('Failed to fetch protocol health data');
        }
        
        const data = await response.json();
        
        // Update the stat cards
        document.getElementById('tvlValue').textContent = formatCurrency(data.totalValueLocked, 'ETH ');
        document.getElementById('totalDebt').textContent = formatCurrency(data.totalDebt, 'tGHSX ');
        document.getElementById('activeVaults').textContent = data.numberOfVaults;
        document.getElementById('avgRatio').textContent = `${parseFloat(data.averageCollateralizationRatio).toFixed(2)}%`;

        // Note: Using dummy history data as the API doesn't provide it.
        // In a real app, you would fetch this historical data from the backend.
        const labels = ['6 days ago', '5 days ago', '4 days ago', '3 days ago', '2 days ago', 'Yesterday', 'Today'];
        const tvlHistory = [10, 25, 40, 30, 55, 70, parseFloat(data.totalValueLocked)];
        const debtHistory = [5000, 12000, 20000, 15000, 28000, 35000, parseFloat(data.totalDebt)];

        // Render the charts
        renderChart('tvlChart', 'TVL (ETH)', labels, tvlHistory, '#3FB950');
        renderChart('debtChart', 'Debt (tGHSX)', labels, debtHistory, 'var(--accent-primary)');

    } catch (error) {
        console.error('Error fetching analytics:', error);
        document.getElementById('tvlValue').textContent = 'Error';
        document.getElementById('totalDebt').textContent = 'Error';
        document.getElementById('activeVaults').textContent = 'Error';
        document.getElementById('avgRatio').textContent = 'Error';
    }
}

/**
 * Renders a line chart using Chart.js.
 * @param {string} canvasId - The ID of the canvas element.
 * @param {string} label - The dataset label.
 * @param {string[]} labels - The labels for the X-axis.
 * @param {number[]} data - The data points for the Y-axis.
 * @param {string} color - The primary color for the line and fill.
 */
function renderChart(canvasId, label, labels, data, color) {
    const ctx = document.getElementById(canvasId).getContext('2d');
    // Destroy previous chart instance if it exists to prevent memory leaks
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
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, ticks: { color: 'var(--text-secondary)' }, grid: { color: 'var(--border-color)' } },
                x: { ticks: { color: 'var(--text-secondary)' }, grid: { display: false } }
            },
            plugins: { legend: { display: false } }
        }
    });

    // Store chart instance to manage its lifecycle
    if (!window.chartInstances) {
        window.chartInstances = {};
    }
    window.chartInstances[canvasId] = chart;
}

// --- Page Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    // The main initializeApp() from shared-wallet.js handles wallet connection.
    // We just need to fetch the data for this specific page.
    fetchAnalyticsData();
});
