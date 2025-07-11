/**
 * ------------------------------------------------------------------------
 * Shared JavaScript for tGHSX Protocol Website
 * ------------------------------------------------------------------------
 * This script handles dynamic content fetching and UI interactions.
 * It's designed to be included on all pages, with specific functions
 * that only run if the required HTML elements are present on the current page.
 */

// Global configuration for the backend API URL.
const BACKEND_URL = 'https://tghsx.onrender.com';

/**
 * Formats a numerical value into a compact currency string (e.g., 1.2M, 15.5K, 123.45).
 * @param {number|string} value The numerical value to format.
 * @param {string} [currency='tGHSX '] The currency symbol or prefix to use.
 * @returns {string} The formatted currency string or 'N/A' if the input is invalid.
 */
function formatCurrency(value, currency = 'tGHSX ') {
    const num = parseFloat(value);
    if (isNaN(num)) return 'N/A';
    if (num >= 1_000_000) return `${currency}${(num / 1_000_000).toFixed(2)}M`;
    if (num >= 1_000) return `${currency}${(num / 1_000).toFixed(1)}K`;
    return `${currency}${num.toFixed(2)}`;
}

/**
 * Formats a numerical value into a percentage string.
 * @param {number|string} value The value to format.
 * @returns {string} The formatted percentage string or 'N/A'.
 */
function formatPercentage(value) {
    const num = parseFloat(value);
    if (isNaN(num)) return 'N/A';
    return `${num.toFixed(2)}%`;
}

/**
 * Fetches and displays live protocol health statistics.
 * This function checks for the existence of stat elements and only runs the API call
 * if they are found (i.e., on the landing page).
 */
async function fetchLiveStats() {
    // Find the elements that will display the stats.
    const liveTvl = document.getElementById('live-tvl');
    const liveDebt = document.getElementById('live-debt');
    const liveVaults = document.getElementById('live-vaults');
    const liveRatio = document.getElementById('live-ratio');

    // If these elements don't exist on the current page, exit the function.
    if (!liveTvl || !liveDebt || !liveVaults || !liveRatio) {
        return;
    }

    const token = localStorage.getItem('accessToken');
    const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

    try {
        const response = await fetch(`${BACKEND_URL}/protocol/health`, { headers });
        if (!response.ok) {
            throw new Error(`Failed to fetch stats with status: ${response.status}`);
        }

        const data = await response.json();

        // Update the content of each element with the fetched and formatted data.
        liveTvl.textContent = formatCurrency(data.totalValueLocked, 'ETH ');
        liveDebt.textContent = formatCurrency(data.totalDebt, 'tGHSX ');
        liveVaults.textContent = data.numberOfVaults || 'N/A';
        liveRatio.textContent = data.averageCollateralizationRatio ? formatPercentage(data.averageCollateralizationRatio) : 'N/A';

    } catch (error) {
        console.error("Could not fetch live stats:", error);
        // If an error occurs, display 'N/A' as a fallback.
        liveTvl.textContent = 'N/A';
        liveDebt.textContent = 'N/A';
        liveVaults.textContent = 'N/A';
        liveRatio.textContent = 'N/A';
    }
}

/**
 * Toggles the visibility of an FAQ answer when its question is clicked.
 * It also ensures only one FAQ item is open at a time.
 * @param {HTMLElement} element The FAQ question element that was clicked.
 */
function toggleFAQ(element) {
    const faqItem = element.parentElement;
    if (!faqItem) return;

    const isActive = faqItem.classList.contains('active');

    // First, close all currently active FAQ items.
    document.querySelectorAll('.faq-item.active').forEach(item => {
        item.classList.remove('active');
        item.querySelector('.faq-toggle').textContent = '+';
    });

    // If the clicked item was not already active, open it.
    if (!isActive) {
        faqItem.classList.add('active');
        element.querySelector('.faq-toggle').textContent = '−';
    }
}

/**
 * Main event listener that runs when the DOM is fully loaded.
 * It sets up event handlers for dynamic parts of the site.
 */
document.addEventListener('DOMContentLoaded', () => {
    // Attempt to fetch live stats. This will only have an effect on the landing page.
    fetchLiveStats();

    // Find all FAQ questions and add a click event listener to each.
    const faqQuestions = document.querySelectorAll('.faq-question');
    faqQuestions.forEach(question => {
        question.addEventListener('click', () => toggleFAQ(question));
    });

    // --- NEW: Mobile Navigation Toggle ---
    const navToggle = document.getElementById('nav-toggle');
    const mainNav = document.getElementById('main-nav');
    const navIcon = navToggle ? navToggle.querySelector('i') : null;

    if (navToggle && mainNav && navIcon) {
        navToggle.addEventListener('click', () => {
            const isNavActive = mainNav.classList.toggle('active');
            document.body.classList.toggle('no-scroll', isNavActive);

            // Change icon from hamburger to 'X' and back
            if (isNavActive) {
                navIcon.classList.remove('fa-bars');
                navIcon.classList.add('fa-times');
                // Make toggle button fixed to stay in view over the menu
                navToggle.style.position = 'fixed';
                navToggle.style.right = '1rem';
                navToggle.style.top = '1.25rem'; // Align with header padding
            } else {
                navIcon.classList.remove('fa-times');
                navIcon.classList.add('fa-bars');
                // Return toggle to its normal position in the document flow
                navToggle.style.position = 'static';
            }
        });
    }
});
