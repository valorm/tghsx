/**
 * ==================================================================================
 * Shared Wallet & App Logic (shared-wallet.js)
 *
 * This script manages the global state for the tGHSX application, including:
 * - Wallet connection (MetaMask & WalletConnect) and state management.
 * - Blockchain interaction setup (ethers.js).
 * - User authentication state (login/logout).
 * - Shared utility functions (toasts, formatting).
 * - Protocol status polling and mobile navigation.
 * ==================================================================================
 */

// --- Import WalletConnect Library ---
// FIX: Using a module-friendly CDN (esm.sh) to resolve the import error.
import EthereumProvider from 'https://esm.sh/@walletconnect/ethereum-provider@2.11.0';

// --- Global Configuration & State ---

const NETWORKS = {
    31337: 'Localhost (Hardhat)',
    80002: 'Polygon Amoy Testnet',
    137: 'Polygon Mainnet',
};
const REQUIRED_CHAIN_ID = 80002; // Polygon Amoy

export const BACKEND_URL = 'https://tghsx.onrender.com';
const CONTRACT_ADDRESS = "0x33B74A7225ec9836DE11e46Ce61026e0B0E7F657";
const COLLATERAL_VAULT_ABI = [ "event CollateralDeposited(address indexed user, uint256 amount, uint256 indexed blockNumber)", "event CollateralWithdrawn(address indexed user, uint256 amount)", "event TGHSXMinted(address indexed user, uint256 amount, uint256 indexed newRatio)", "event TGHSXBurned(address indexed user, uint256 amount, uint256 indexed newRatio)", "function deposit() external payable", "function withdraw(uint256 amount) external", "function mintTGHSX(uint256 amount) external", "function burnTGHSX(uint256 amount) external", "function depositAndMint(uint256 tghsxAmountToMint) external payable", "function repayAndWithdraw(uint256 repayAmount, uint256 withdrawAmount) external", "function getEthGhsPrice() public view returns (uint256 ethGhsPrice)", "function getUserCollateral(address user) external view returns (uint256)", "function getUserDebt(address user) external view returns (uint256)", "function getCollateralizationRatio(address user) external view returns (uint256)", "function tghsxToken() view returns (address)", "function liquidateVault(address user, uint256 tghsxToRepay) external", "function paused() view returns (bool)" ];
const TGHSX_ABI = [ "function approve(address spender, uint256 amount) external returns (bool)", "function allowance(address owner, address spender) external view returns (uint256)" ];

// FIX: Exporting appState so it can be imported by other modules.
export const appState = {
    userAccount: null,
    provider: null,
    signer: null,
    isConnecting: false,
    isCorrectNetwork: false,
    networkName: null,
    collateralVaultContract: null,
    tghsxTokenContract: null,
    isProtocolPaused: false,
    connectionType: null, // 'metamask' or 'walletconnect'
};

let walletConnectProvider = null;

// --- Core Wallet & Blockchain Functions ---

/**
 * Initializes the WalletConnect provider instance.
 */
async function initializeWalletConnect() {
    try {
        const projectId = '4571f8b102cc836bdd761e9798a0e1f4'; 

        walletConnectProvider = await EthereumProvider.init({
            projectId,
            chains: [REQUIRED_CHAIN_ID],
            showQrModal: true,
            qrModalOptions: {
                themeMode: "dark",
                explorerRecommendedWalletIds: 'c57ca95b47569778a828d19178114f4db18e6954006d01c20f0de37c162d44cb',
            },
        });

        walletConnectProvider.on("disconnect", () => {
            console.log("WalletConnect session disconnected");
            resetWalletState();
        });

    } catch (e) {
        console.error("Failed to initialize WalletConnect provider", e);
        showToast("Could not start WalletConnect.", "error");
    }
}

/**
 * Opens the connection modal.
 */
export function connectWallet() {
    const modal = document.getElementById('connectionModal');
    if (modal) {
        modal.classList.add('show');
    } else {
        console.error("Connection modal not found in the DOM.");
    }
}

/**
 * Connects using MetaMask.
 */
async function connectWithMetaMask() {
    if (typeof window.ethereum === 'undefined') {
        return showToast('MetaMask is not installed.', 'error');
    }
    
    appState.isConnecting = true;
    updateWalletUI();

    try {
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        if (accounts.length === 0) throw new Error('No accounts found in MetaMask.');
        
        appState.connectionType = 'metamask';
        localStorage.setItem('walletConnected', 'metamask');
        
        const provider = new ethers.providers.Web3Provider(window.ethereum);
        await setupProviderAndState(provider, accounts[0]);

    } catch (error) {
        console.error('Error connecting with MetaMask:', error);
        showToast(getErrorMessage(error), 'error');
        resetWalletState();
    } finally {
        appState.isConnecting = false;
        updateWalletUI();
    }
}

/**
 * Connects using WalletConnect.
 */
async function connectWithWalletConnect() {
    if (!walletConnectProvider) {
        await initializeWalletConnect();
    }

    appState.isConnecting = true;
    updateWalletUI();

    try {
        await walletConnectProvider.connect();
        const accounts = walletConnectProvider.accounts;
        if (accounts.length === 0) throw new Error('No accounts found via WalletConnect.');

        appState.connectionType = 'walletconnect';
        localStorage.setItem('walletConnected', 'walletconnect');

        const provider = new ethers.providers.Web3Provider(walletConnectProvider);
        await setupProviderAndState(provider, accounts[0]);

    } catch (error) {
        console.error('Error connecting with WalletConnect:', error);
        showToast(getErrorMessage(error), 'error');
        resetWalletState();
    } finally {
        appState.isConnecting = false;
        updateWalletUI();
    }
}

/**
 * Centralized function to set up state after connection.
 */
async function setupProviderAndState(provider, account) {
    appState.provider = provider;
    appState.signer = provider.getSigner();
    appState.userAccount = account;

    await checkNetwork();
    
    if (appState.isCorrectNetwork) {
        await initializeContracts();
        await fetchProtocolStatus();
        await saveWalletAddressToBackend(account);
        document.dispatchEvent(new CustomEvent('networkConnected'));
    }
    
    updateWalletUI();
    listenToProviderEvents();
}

/**
 * Sets up listeners for provider events.
 */
function listenToProviderEvents() {
    const providerSource = appState.connectionType === 'metamask' ? window.ethereum : walletConnectProvider;
    if (!providerSource) return;

    providerSource.removeAllListeners('accountsChanged');
    providerSource.removeAllListeners('chainChanged');

    providerSource.on('accountsChanged', (accounts) => {
        if (accounts.length === 0) {
            resetWalletState();
        } else {
            window.location.reload();
        }
    });

    providerSource.on('chainChanged', () => window.location.reload());
}


/**
 * Checks the connected network.
 */
async function checkNetwork() {
    if (!appState.provider) return;
    try {
        const network = await appState.provider.getNetwork();
        const friendlyName = NETWORKS[network.chainId];
        
        if (network.chainId === REQUIRED_CHAIN_ID) {
            appState.isCorrectNetwork = true;
            appState.networkName = `${friendlyName} (ID: ${network.chainId})`;
        } else {
            appState.isCorrectNetwork = false;
            appState.networkName = `Wrong Network (ID: ${network.chainId})`;
            showToast(`Please switch to ${NETWORKS[REQUIRED_CHAIN_ID]}.`, 'error');
        }
    } catch (error) {
        console.error('Error checking network:', error);
        resetWalletState();
    }
}

/**
 * Disconnects the wallet.
 */
export async function disconnectWallet() {
    if (appState.connectionType === 'walletconnect' && walletConnectProvider?.connected) {
        await walletConnectProvider.disconnect();
    }
    resetWalletState();
    showToast('Wallet disconnected', 'info');
}

/**
 * Resets the wallet state.
 */
function resetWalletState() {
    appState.userAccount = null;
    appState.provider = null;
    appState.signer = null;
    appState.isCorrectNetwork = false;
    appState.networkName = null;
    appState.collateralVaultContract = null;
    appState.tghsxTokenContract = null;
    appState.isProtocolPaused = false;
    appState.connectionType = null;

    localStorage.removeItem('walletConnected');
    updateWalletUI();
    document.dispatchEvent(new Event('walletDisconnected'));
}

/**
 * Checks for an existing connection on page load.
 */
async function checkForExistingConnection() {
    const connectionType = localStorage.getItem('walletConnected');
    if (!connectionType) return;

    if (connectionType === 'walletconnect' && walletConnectProvider?.accounts?.length > 0) {
        await connectWithWalletConnect();
    } else if (connectionType === 'metamask' && window.ethereum) {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        if (accounts.length > 0) {
            await connectWithMetaMask();
        } else {
            resetWalletState();
        }
    }
}

/**
 * Initializes contract instances.
 */
async function initializeContracts() {
    if (!appState.signer) return false;
    try {
        appState.collateralVaultContract = new ethers.Contract(CONTRACT_ADDRESS, COLLATERAL_VAULT_ABI, appState.signer);
        const tghsxTokenAddress = await appState.collateralVaultContract.tghsxToken();
        appState.tghsxTokenContract = new ethers.Contract(tghsxTokenAddress, TGHSX_ABI, appState.signer);
        return true;
    } catch (error) {
        console.error('Failed to initialize contracts:', error);
        showToast('Failed to connect to smart contracts.', 'error');
        resetWalletState();
        return false;
    }
}

/**
 * Fetches the protocol's pause status.
 */
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

/**
 * Saves wallet address to the backend.
 */
async function saveWalletAddressToBackend(walletAddress) {
    const token = localStorage.getItem('accessToken');
    if (!token) return;

    try {
        await fetch(`${BACKEND_URL}/vault/save-wallet-address`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ wallet_address: walletAddress })
        });
    } catch (error) {
        console.error('Error saving wallet address:', error);
    }
}


// --- UI & Utility Functions ---

/**
 * Updates the wallet button UI.
 */
function updateWalletUI() {
    const walletBtn = document.getElementById('walletBtn');
    if (!walletBtn) return;

    if (appState.isConnecting) {
        walletBtn.textContent = 'Connecting...';
        walletBtn.disabled = true;
    } else if (appState.userAccount) {
        walletBtn.textContent = formatAddress(appState.userAccount);
        walletBtn.classList.add('connected');
        walletBtn.onclick = disconnectWallet;
        walletBtn.disabled = false;
    } else {
        walletBtn.textContent = 'Connect Wallet';
        walletBtn.classList.remove('connected');
        walletBtn.onclick = connectWallet;
        walletBtn.disabled = false;
    }
}

export function formatAddress(address) {
    if (!address || address.length < 10) return '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function logoutUser() {
    disconnectWallet();
    localStorage.removeItem('accessToken');
    showToast('You have been logged out.', 'info');
    setTimeout(() => {
        window.location.href = './auth.html';
    }, 1500);
}

let toastTimeout;
export function showToast(message, type = 'success') {
    const toast = document.getElementById('toastNotification');
    if (!toast) return;
    if (toastTimeout) clearTimeout(toastTimeout);
    toast.textContent = message;
    toast.className = `toast show ${type}`;
    toastTimeout = setTimeout(() => {
        toast.classList.remove('show');
    }, 5000);
}

export function getErrorMessage(error) {
    if (error.code) {
        switch (error.code) {
            case 4001: return 'Transaction cancelled by user.';
            case -32603: return 'Internal JSON-RPC error. The contract may have rejected the transaction.';
            case -32002: return 'Request already pending. Please check your wallet.';
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

async function initializeApp() {
    const token = localStorage.getItem('accessToken');
    const onAuthPage = window.location.pathname.endsWith('auth.html');
    if (!token && !onAuthPage) {
        window.location.href = './auth.html';
        return;
    }

    const connectMetaMaskBtn = document.getElementById('connectMetaMaskBtn');
    const connectWalletConnectBtn = document.getElementById('connectWalletConnectBtn');
    const cancelConnectionBtn = document.getElementById('cancelConnectionBtn');
    const menuToggle = document.getElementById('menu-toggle');
    const navMenu = document.getElementById('nav-menu');

    document.getElementById('walletBtn')?.addEventListener('click', connectWallet);
    document.getElementById('logoutBtn')?.addEventListener('click', logoutUser);
    
    if (connectMetaMaskBtn) connectMetaMaskBtn.addEventListener('click', () => {
        document.getElementById('connectionModal').classList.remove('show');
        connectWithMetaMask();
    });
    if (connectWalletConnectBtn) connectWalletConnectBtn.addEventListener('click', () => {
        document.getElementById('connectionModal').classList.remove('show');
        connectWithWalletConnect();
    });
    if (cancelConnectionBtn) cancelConnectionBtn.addEventListener('click', () => {
        document.getElementById('connectionModal').classList.remove('show');
    });

    if (menuToggle && navMenu) {
        menuToggle.addEventListener('click', () => {
            navMenu.classList.toggle('active');
            const icon = menuToggle.querySelector('i');
            icon.classList.toggle('fa-bars', !navMenu.classList.contains('active'));
            icon.classList.toggle('fa-times', navMenu.classList.contains('active'));
        });
    }

    await initializeWalletConnect();
    await checkForExistingConnection();
    updateWalletUI();

    setInterval(fetchProtocolStatus, 60000); 
}

document.addEventListener('DOMContentLoaded', initializeApp);
