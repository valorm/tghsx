/**
 * ==================================================================================
 * Shared Wallet & App Logic (shared-wallet.js)
 *
 * This script manages the global state for the tGHSX application, including:
 * - Wallet connection (MetaMask) and state management.
 * - Blockchain interaction setup (ethers.js).
 * - User authentication state (login/logout).
 * - Shared utility functions (toasts, formatting).
 * - Protocol status polling.
 * ==================================================================================
 */

// --- Global Configuration & State ---

const NETWORKS = {
    31337: 'Localhost (Hardhat)',
    80002: 'Polygon Amoy Testnet',
    137: 'Polygon Mainnet',
};

const BACKEND_URL = 'https://tghsx.onrender.com';
const CONTRACT_ADDRESS = "0x33B74A7225ec9836DE11e46Ce61026e0B0E7F657";
const COLLATERAL_VAULT_ABI = [ "event CollateralDeposited(address indexed user, uint256 amount, uint256 indexed blockNumber)", "event CollateralWithdrawn(address indexed user, uint256 amount)", "event TGHSXMinted(address indexed user, uint256 amount, uint256 indexed newRatio)", "event TGHSXBurned(address indexed user, uint256 amount, uint256 indexed newRatio)", "function deposit() external payable", "function withdraw(uint256 amount) external", "function mintTGHSX(uint256 amount) external", "function burnTGHSX(uint256 amount) external", "function depositAndMint(uint256 tghsxAmountToMint) external payable", "function repayAndWithdraw(uint256 repayAmount, uint256 withdrawAmount) external", "function getEthGhsPrice() public view returns (uint256 ethGhsPrice)", "function getUserCollateral(address user) external view returns (uint256)", "function getUserDebt(address user) external view returns (uint256)", "function getCollateralizationRatio(address user) external view returns (uint256)", "function tghsxToken() view returns (address)", "function liquidateVault(address user, uint256 tghsxToRepay) external", "function paused() view returns (bool)" ];
const TGHSX_ABI = [ "function approve(address spender, uint256 amount) external returns (bool)", "function allowance(address owner, address spender) external view returns (uint256)" ];

const appState = {
    userAccount: null,
    provider: null,
    signer: null,
    isConnecting: false,
    isCorrectNetwork: false,
    networkName: null,
    collateralVaultContract: null,
    tghsxTokenContract: null,
    isProtocolPaused: false,
};

// --- Core Wallet & Blockchain Functions ---

async function connectWallet() {
    if (appState.isConnecting) return;

    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

    if (isMobile) {
        // For mobile, generate a deep link to open a wallet app
        const dappUrl = window.location.href.split('?')[0]; // URL of the current page
        const metamaskAppUrl = `https://metamask.app.link/dapp/${dappUrl}`;
        window.open(metamaskAppUrl, '_blank');
        showToast('Connecting with your mobile wallet...', 'info');
        return;
    }

    if (typeof window.ethereum === 'undefined') {
        return showToast('MetaMask is not installed. Please install it to continue.', 'error');
    }

    const walletBtn = document.getElementById('walletBtn');
    try {
        appState.isConnecting = true;
        if (walletBtn) {
            walletBtn.textContent = 'Connecting...';
            walletBtn.disabled = true;
        }

        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        if (accounts.length === 0) throw new Error('No accounts found in MetaMask.');

        localStorage.setItem('walletConnected', 'true');
        await handleAccountsChanged(accounts);

    } catch (error) {
        console.error('Error connecting wallet:', error);
        showToast(getErrorMessage(error), 'error');
        resetWalletState();
    } finally {
        appState.isConnecting = false;
        if (walletBtn) walletBtn.disabled = false;
        updateWalletUI();
    }
}

async function handleAccountsChanged(accounts) {
    if (accounts.length === 0) {
        return resetWalletState();
    }

    const previousAccount = appState.userAccount;
    appState.userAccount = accounts[0];

    if (!appState.provider) {
        appState.provider = new ethers.providers.Web3Provider(window.ethereum);
    }
    appState.signer = appState.provider.getSigner();

    updateWalletUI();

    await saveWalletAddressToBackend(appState.userAccount);

    if (await initializeContracts()) {
        await checkNetwork();
        await fetchProtocolStatus();
    }

    if (previousAccount && previousAccount.toLowerCase() !== appState.userAccount.toLowerCase()) {
        document.dispatchEvent(new CustomEvent('accountChanged', { detail: { account: appState.userAccount } }));
    }
}

async function initializeContracts() {
    if (!appState.signer) return false;
    try {
        appState.collateralVaultContract = new ethers.Contract(CONTRACT_ADDRESS, COLLATERAL_VAULT_ABI, appState.signer);
        const tghsxTokenAddress = await appState.collateralVaultContract.tghsxToken();
        appState.tghsxTokenContract = new ethers.Contract(tghsxTokenAddress, TGHSX_ABI, appState.signer);
        console.log("Contracts initialized successfully.");
        return true;
    } catch (error) {
        console.error('Failed to initialize contracts:', error);
        showToast('Failed to connect to smart contracts.', 'error');
        resetWalletState();
        return false;
    }
}

async function fetchProtocolStatus() {
    if (!appState.collateralVaultContract) return;
    try {
        const isPaused = await appState.collateralVaultContract.paused();
        appState.isProtocolPaused = isPaused;
        document.dispatchEvent(new CustomEvent('protocolStatusUpdated', { detail: { isPaused } }));
    } catch (error) {
        console.error("Could not fetch protocol status:", error);
        appState.isProtocolPaused = false;
        document.dispatchEvent(new CustomEvent('protocolStatusUpdated', { detail: { isPaused: false, error: true } }));
    }
}


async function checkNetwork() {
    if (!appState.provider) return;
    try {
        const network = await appState.provider.getNetwork();
        const friendlyName = NETWORKS[network.chainId];
        if (friendlyName) {
            appState.isCorrectNetwork = true;
            appState.networkName = `${friendlyName} (ID: ${network.chainId})`;
            document.dispatchEvent(new CustomEvent('networkConnected', { detail: { networkName: appState.networkName } }));
        } else {
            appState.isCorrectNetwork = false;
            showToast(`Wrong Network. Please switch to a supported network like Polygon Amoy.`, 'error');
            document.dispatchEvent(new Event('networkDisconnected'));
        }
    } catch (error) {
        console.error('Error checking network:', error);
        resetWalletState();
    }
}

function disconnectWallet() {
    localStorage.setItem('wallet_disconnected', 'true');
    resetWalletState();
    showToast('Wallet disconnected', 'info');
}

function resetWalletState() {
    appState.userAccount = null;
    appState.provider = null;
    appState.signer = null;
    appState.isCorrectNetwork = false;
    appState.networkName = null;
    appState.collateralVaultContract = null;
    appState.tghsxTokenContract = null;
    appState.isProtocolPaused = false;

    localStorage.removeItem('walletConnected');
    localStorage.removeItem('wallet_disconnected');

    updateWalletUI();
    document.dispatchEvent(new Event('walletDisconnected'));
}

async function checkForExistingConnection() {
    if (localStorage.getItem('walletConnected') === 'true' && window.ethereum) {
        try {
            const accounts = await window.ethereum.request({ method: 'eth_accounts' });
            if (accounts.length > 0) {
                await handleAccountsChanged(accounts);
            } else {
                resetWalletState();
            }
        } catch (error) {
            console.error('Error checking for existing connection:', error);
            resetWalletState();
        }
    }
}

async function saveWalletAddressToBackend(walletAddress) {
    const token = localStorage.getItem('accessToken');
    if (!token) return;

    try {
        const response = await fetch(`${BACKEND_URL}/vault/save-wallet-address`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ wallet_address: walletAddress })
        });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || 'Failed to save wallet address.');
        }
        console.log('Wallet address saved to profile successfully.');
    } catch (error) {
        console.error('Error saving wallet address:', error);
    }
}


// --- UI & Utility Functions ---

function updateWalletUI() {
    const walletBtn = document.getElementById('walletBtn');
    if (!walletBtn) return;

    if (appState.userAccount) {
        walletBtn.textContent = formatAddress(appState.userAccount);
        walletBtn.classList.add('connected');
        walletBtn.onclick = disconnectWallet;
    } else {
        walletBtn.textContent = 'Connect Wallet';
        walletBtn.classList.remove('connected');
        walletBtn.onclick = connectWallet;
    }
}

function formatAddress(address) {
    if (!address || address.length < 10) return '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function logoutUser() {
    localStorage.removeItem('accessToken');
    resetWalletState();
    showToast('You have been logged out.', 'info');
    setTimeout(() => {
        window.location.href = './auth.html';
    }, 1500);
}

let toastTimeout;
function showToast(message, type = 'success') {
    const toast = document.getElementById('toastNotification');
    if (!toast) {
        console.warn('Toast notification element not found on this page.');
        return;
    }
    if (toastTimeout) clearTimeout(toastTimeout);
    toast.textContent = message;
    toast.className = `toast show ${type}`;
    toastTimeout = setTimeout(() => {
        toast.classList.remove('show');
    }, 5000);
}

function getErrorMessage(error) {
    if (error.code) {
        switch (error.code) {
            case 4001: return 'Transaction cancelled by user.';
            case -32603: return 'Internal JSON-RPC error. The contract may have rejected the transaction.';
            case -32002: return 'Request already pending. Please check your MetaMask wallet.';
            case 'UNPREDICTABLE_GAS_LIMIT': return 'Transaction cannot be completed. The collateral ratio is likely out of the allowed range.';
            case 'INSUFFICIENT_FUNDS': return 'Your wallet has insufficient ETH for this transaction, including gas fees.';
        }
    }
    if (error.message) {
        if (error.message.toLowerCase().includes('user rejected') || error.message.toLowerCase().includes('user denied')) {
            return 'Transaction cancelled by user.';
        }
        if (error.message.toLowerCase().includes('insufficient funds')) {
            return 'Insufficient funds for transaction.';
        }
    }
    return 'An unexpected error occurred. Please try again.';
}


// --- App Initialization ---

function initializeApp() {
    const token = localStorage.getItem('accessToken');
    const onAuthPage = window.location.pathname.endsWith('auth.html');
    if (!token && !onAuthPage) {
        window.location.href = './auth.html';
        return;
    }

    const walletBtn = document.getElementById('walletBtn');
    const logoutBtn = document.getElementById('logoutBtn');

    if (walletBtn) walletBtn.onclick = connectWallet;
    if (logoutBtn) logoutBtn.onclick = logoutUser;

    if (window.ethereum) {
        window.ethereum.on('accountsChanged', (accounts) => handleAccountsChanged(accounts));
        window.ethereum.on('chainChanged', () => window.location.reload());
    }

    if (localStorage.getItem('wallet_disconnected') !== 'true') {
        checkForExistingConnection();
    }

    updateWalletUI();

    setInterval(fetchProtocolStatus, 60000);

    // --- Mobile Navigation Logic ---
    const menuIcon = document.querySelector('.menu-icon');
    const navUl = document.querySelector('nav ul');

    if (menuIcon && navUl) {
        menuIcon.addEventListener('click', () => {
            navUl.classList.toggle('active');
        });
    }
}

document.addEventListener('DOMContentLoaded', initializeApp);
