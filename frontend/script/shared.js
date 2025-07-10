/**
 * shared.js
 *
 * This script contains shared functionality for the tGHSX application,
 * including authentication, wallet management, API calls, and UI utilities.
 * It creates a global `app` object to namespace its functions and state.
 */

// --- Global Application Namespace ---
const app = {
    // --- STATE ---
    // Shared state for the entire application
    state: {
        // Constants
        BACKEND_URL: 'http://127.0.0.1:8000',
        ADMIN_USER_ID: "d50bb916-fa10-4a8e-8bff-bc76820901eb",
        NETWORKS: {
            31337: 'Localhost (Hardhat)',
            80002: 'Polygon Amoy Testnet',
            137: 'Polygon Mainnet',
        },
        // Dynamic State
        userAccount: null,
        provider: null,
        signer: null,
        isConnecting: false,
        isCorrectNetwork: false,
        currentToken: null,
    },

    // --- INITIALIZATION ---
    /**
     * Initializes the shared components of the application on any page.
     * This function should be called on DOMContentLoaded.
     */
    init() {
        // Check authentication status on every page load
        this.auth.checkLoginStatus();

        // Initialize common UI elements like navbar buttons
        this.ui.initNavbar();

        // Attempt to connect to an existing wallet session
        this.wallet.checkExistingConnection();

        // Add listeners for wallet events
        if (window.ethereum) {
            window.ethereum.on('accountsChanged', (accounts) => this.wallet.handleAccountsChanged(accounts));
            window.ethereum.on('chainChanged', () => window.location.reload());
        }
    },

    // --- AUTHENTICATION MODULE ---
    auth: {
        /**
         * Checks if a user is logged in by looking for an access token.
         * Redirects to the auth page if not logged in, for protected pages.
         */
        checkLoginStatus() {
            app.state.currentToken = localStorage.getItem('accessToken');
            const isAuthPage = window.location.pathname.includes('auth.html');

            if (!app.state.currentToken && !isAuthPage) {
                console.log('No access token found, redirecting to login.');
                window.location.href = './auth.html';
            }
        },

        /**
         * Logs the user out by clearing the token and redirecting.
         */
        logout() {
            localStorage.removeItem('accessToken');
            localStorage.setItem('wallet_disconnected', 'true'); // Also disconnect wallet
            app.ui.showToast('You have been logged out.', 'info');
            setTimeout(() => {
                window.location.href = './auth.html';
            }, 1000);
        },

        /**
         * Validates if the currently logged-in user is an admin.
         * @returns {boolean} - True if the user is an admin.
         */
        isAdmin() {
            if (!app.state.currentToken) return false;
            try {
                const payload = JSON.parse(atob(app.state.currentToken.split('.')[1]));
                return payload.sub === app.state.ADMIN_USER_ID;
            } catch (e) {
                console.error("Error decoding token:", e);
                return false;
            }
        }
    },

    // --- WALLET MANAGEMENT MODULE ---
    wallet: {
        /**
         * Initiates the wallet connection process.
         */
        async connect() {
            localStorage.removeItem('wallet_disconnected');
            if (app.state.isConnecting || app.state.userAccount) return;

            if (typeof window.ethereum === 'undefined') {
                return app.ui.showToast('MetaMask is not installed. Please install it.', 'error');
            }

            try {
                app.state.isConnecting = true;
                app.ui.updateWalletButton('Connecting...');

                const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
                await this.handleAccountsChanged(accounts);

            } catch (error) {
                console.error('connectWallet error:', error);
                app.ui.showToast(app.utils.getErrorMessage(error), 'error');
                this.reset();
            } finally {
                app.state.isConnecting = false;
                app.ui.updateWalletButton();
            }
        },

        /**
         * Disconnects the wallet and resets its state.
         */
        disconnect() {
            localStorage.setItem('wallet_disconnected', 'true');
            this.reset();
            app.ui.showToast('Wallet disconnected', 'info');
            // Dispatch event for pages to listen to
            document.dispatchEvent(new CustomEvent('walletDisconnected'));
        },

        /**
         * Resets the wallet state to default values.
         */
        reset() {
            app.state.userAccount = null;
            app.state.provider = null;
            app.state.signer = null;
            app.state.isCorrectNetwork = false;
            app.ui.updateWalletButton();
            app.ui.updateNetworkStatus(false, 'Not Connected');
        },

        /**
         * Handles account changes from MetaMask.
         * @param {string[]} accounts - The array of accounts from MetaMask.
         */
        async handleAccountsChanged(accounts) {
            if (accounts.length === 0) {
                return this.disconnect();
            }
            app.state.userAccount = accounts[0];
            app.state.provider = new ethers.providers.Web3Provider(window.ethereum);
            app.state.signer = app.state.provider.getSigner();
            
            app.ui.updateWalletButton();
            await this.checkNetwork();
        },
        
        /**
         * Checks if the connected network is supported by the application.
         */
        async checkNetwork() {
            if (!app.state.provider) return;
            try {
                const network = await app.state.provider.getNetwork();
                const friendlyName = app.state.NETWORKS[network.chainId];

                if (friendlyName) {
                    app.state.isCorrectNetwork = true;
                    app.ui.updateNetworkStatus(true, `${friendlyName} (ID: ${network.chainId})`);
                    app.ui.showToast(`Connected to ${friendlyName}.`, 'success');
                    // Dispatch event for pages to listen to
                    document.dispatchEvent(new CustomEvent('networkConnected', { detail: { provider: app.state.provider, signer: app.state.signer } }));
                } else {
                    app.state.isCorrectNetwork = false;
                    app.ui.updateNetworkStatus(false, `${network.name} (Unsupported)`);
                    app.ui.showToast(`Unsupported Network. Please switch to Polygon Amoy or Mainnet.`, 'error');
                    // Dispatch event for pages to listen to
                    document.dispatchEvent(new CustomEvent('walletDisconnected'));
                }
            } catch (error) {
                console.error("Could not check network:", error);
                app.state.isCorrectNetwork = false;
                this.reset();
            }
        },

        /**
         * Checks for an existing wallet connection on page load.
         */
        async checkExistingConnection() {
            if (localStorage.getItem('wallet_disconnected') === 'true') return;
            if (window.ethereum) {
                try {
                    const accounts = await window.ethereum.request({ method: 'eth_accounts' });
                    if (accounts.length > 0) {
                        await this.handleAccountsChanged(accounts);
                    }
                } catch (error) {
                    console.error('Error checking for existing wallet connection:', error);
                }
            }
        }
    },

    // --- UI MODULE ---
    ui: {
        /**
         * Initializes the navigation bar buttons.
         */
        initNavbar() {
            const logoutBtn = document.getElementById('logoutBtn');
            const walletBtn = document.getElementById('walletBtn');

            if (logoutBtn) {
                logoutBtn.addEventListener('click', () => app.auth.logout());
            }
            if (walletBtn) {
                walletBtn.addEventListener('click', () => app.wallet.connect());
            }
        },

        /**
         * Updates the wallet button text and state.
         * @param {string} [text] - Optional text to display on the button.
         */
        updateWalletButton(text) {
            const walletBtn = document.getElementById('walletBtn');
            if (!walletBtn) return;

            if (text) {
                walletBtn.textContent = text;
                walletBtn.disabled = true;
            } else if (app.state.userAccount) {
                walletBtn.textContent = app.utils.formatAddress(app.state.userAccount);
                walletBtn.disabled = false;
                walletBtn.onclick = () => app.wallet.disconnect();
            } else {
                walletBtn.textContent = 'Connect Wallet';
                walletBtn.disabled = false;
                walletBtn.onclick = () => app.wallet.connect();
            }
        },

        /**
         * Updates the network status indicator in the UI.
         * @param {boolean} isConnected - Whether the network is correctly connected.
         * @param {string} networkName - The name of the network to display.
         */
        updateNetworkStatus(isConnected, networkName) {
            const networkStatusEl = document.getElementById('networkStatus');
            const networkNameEl = document.getElementById('networkName');
            const networkIndicatorEl = document.getElementById('networkIndicator');

            if (networkStatusEl && networkNameEl && networkIndicatorEl) {
                networkStatusEl.classList.toggle('connected', isConnected);
                networkIndicatorEl.classList.toggle('connected', isConnected);
                networkNameEl.textContent = networkName;
            }
        },
        
        /**
         * Displays a toast notification.
         * @param {string} message - The message to display.
         * @param {string} [type='info'] - The type of toast (info, success, error).
         */
        showToast(message, type = 'info') {
            const toast = document.getElementById('toastNotification');
            if (!toast) return;
            toast.textContent = message;
            toast.className = `toast show ${type}`;
            setTimeout(() => toast.classList.remove('show'), 4000);
        },

        /**
         * Sets the loading state for a button.
         * @param {string} buttonId - The ID of the button element.
         * @param {boolean} loading - True to show loading state, false to remove it.
         */
        setButtonLoading(buttonId, loading) {
            const button = document.getElementById(buttonId);
            if (!button) return;
            button.disabled = loading;
            button.classList.toggle('loading', loading);
        }
    },

    // --- UTILITIES MODULE ---
    utils: {
        /**
         * A generic function for making authenticated API calls.
         * @param {string} endpoint - The API endpoint to call.
         * @param {object} [options={}] - Fetch options (method, body, etc.).
         * @returns {Promise<any>} - The JSON response from the API.
         */
        async apiCall(endpoint, options = {}) {
            const headers = {
                'Authorization': `Bearer ${app.state.currentToken}`,
                'Content-Type': 'application/json',
                ...options.headers,
            };
            const response = await fetch(`${app.state.BACKEND_URL}${endpoint}`, { ...options, headers });

            if (response.status === 401) {
                app.auth.logout();
                throw new Error('Session expired. Please log in again.');
            }
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ detail: 'An unknown API error occurred.' }));
                throw new Error(errorData.detail);
            }
            return response.json();
        },

        /**
         * Formats a number to a string with a fixed number of decimal places.
         * @param {(number|string)} num - The number to format.
         * @param {number} [decimals=2] - The number of decimal places.
         * @returns {string} - The formatted number.
         */
        formatNumber(num, decimals = 2) {
             if (num === null || num === undefined || isNaN(num)) return (0).toFixed(decimals);
             return parseFloat(num).toLocaleString('en-US', {
                minimumFractionDigits: decimals,
                maximumFractionDigits: decimals,
                useGrouping: false
            });
        },
        
        /**
         * Formats a number as a currency string.
         * @param {(number|string)} value - The value to format.
         * @param {string} [currency='GH₵'] - The currency symbol.
         * @returns {string} - The formatted currency string.
         */
        formatCurrency(value, currency = 'GH₵') {
            const num = parseFloat(value);
            if (isNaN(num)) return 'N/A';
            if (num >= 1_000_000) return `${currency}${(num / 1_000_000).toFixed(2)}M`;
            if (num >= 1_000) return `${currency}${(num / 1_000).toFixed(1)}K`;
            return `${currency}${num.toFixed(2)}`;
        },

        /**
         * Shortens a wallet address for display.
         * @param {string} address - The full address.
         * @returns {string} - The shortened address (e.g., 0x123...456).
         */
        formatAddress(address) {
            if (!address || address.length < 10) return '';
            return `${address.slice(0, 6)}...${address.slice(-4)}`;
        },
        
        /**
         * Gets a user-friendly error message from a web3 error object.
         * @param {object} error - The error object from ethers.js or MetaMask.
         * @returns {string} - A user-friendly error message.
         */
        getErrorMessage(error) {
            const errorMap = {
                4001: 'Transaction cancelled by user.',
                "-32603": 'Transaction failed. The collateral ratio may be out of range, or another contract rule was violated.',
                'UNPREDICTABLE_GAS_LIMIT': 'Transaction cannot be completed. The collateral ratio is likely out of the allowed range.',
                'INSUFFICIENT_FUNDS': 'Your wallet has insufficient ETH for this transaction, including gas fees.',
                "-32000": 'The network is busy and rejected the transaction. Please try again in a moment.',
                "-32002": 'Request already pending. Please check your MetaMask wallet.'
            };
            if (error.code && errorMap[error.code]) return errorMap[error.code];
            if (error.code && errorMap[error.code.toString()]) return errorMap[error.code.toString()];
            if (error.message) {
                const message = error.message.toLowerCase();
                if (message.includes('user rejected') || message.includes('user denied')) return 'Transaction cancelled by user.';
                if (message.includes('insufficient funds')) return 'Your wallet has insufficient ETH for this transaction, including gas fees.';
            }
            return 'An unexpected error occurred. Please try again.';
        }
    }
};

// --- GLOBAL INITIALIZATION ---
// The main entry point for all pages using this script.
document.addEventListener('DOMContentLoaded', () => {
    app.init();
});
