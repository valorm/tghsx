/**
 * ==================================================================================
 * Shared Wallet & App Logic (shared-wallet.js) - CHAIN SWITCH FIX V10
 *
 * This script manages the global state for the tGHSX application.
 * This version includes a critical fix to proactively handle network mismatches
 * by prompting the user to switch to the correct chain.
 * ==================================================================================
 */

import EthereumProvider from 'https://esm.sh/@walletconnect/ethereum-provider@2.13.0';

// --- Configuration ---
const NETWORKS = {
    31337: 'Localhost (Hardhat)',
    80002: 'Polygon Amoy Testnet',
    137: 'Polygon Mainnet',
};
const REQUIRED_CHAIN_ID = 80002;
export const BACKEND_URL = 'https://tghsx.onrender.com';
const CONTRACT_ADDRESS = "0x33B74A7225ec9836DE11e46Ce61026e0B0E7F657";
const COLLATERAL_VAULT_ABI = [ "event CollateralDeposited(address indexed user, uint256 amount, uint256 indexed blockNumber)", "event CollateralWithdrawn(address indexed user, uint256 amount)", "event TGHSXMinted(address indexed user, uint256 amount, uint256 indexed newRatio)", "event TGHSXBurned(address indexed user, uint256 amount, uint256 indexed newRatio)", "function deposit() external payable", "function withdraw(uint256 amount) external", "function mintTGHSX(uint256 amount) external", "function burnTGHSX(uint256 amount) external", "function depositAndMint(uint256 tghsxAmountToMint) external payable", "function repayAndWithdraw(uint256 repayAmount, uint256 withdrawAmount) external", "function getEthGhsPrice() public view returns (uint256 ethGhsPrice)", "function getUserCollateral(address user) external view returns (uint256)", "function getUserDebt(address user) external view returns (uint256)", "function getCollateralizationRatio(address user) external view returns (uint256)", "function tghsxToken() view returns (address)", "function liquidateVault(address user, uint256 tghsxToRepay) external", "function paused() view returns (bool)" ];
const TGHSX_ABI = [ "function approve(address spender, uint256 amount) external returns (bool)", "function allowance(address owner, address spender) external view returns (uint256)" ];

// --- Global State ---
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
    connectionType: null,
};

let walletConnectProvider = null;

/**
 * Initializes the WalletConnect provider and sets up crucial event listeners.
 */
async function initializeWalletConnect() {
    console.log("Initializing WalletConnect...");
    try {
        const projectId = '4571f8b102cc836bdd761e9798a0e1f4';
        walletConnectProvider = await EthereumProvider.init({
            projectId,
            chains: [REQUIRED_CHAIN_ID],
            optionalChains: Object.keys(NETWORKS).map(Number).filter(id => id !== REQUIRED_CHAIN_ID),
            showQrModal: true,
            qrModalOptions: { themeMode: "dark" },
            metadata: {
                name: "tGHSX Protocol",
                description: "The Synthetic Ghanaian Cedi, backed by Crypto.",
                url: "https://tghsx.vercel.app",
                icons: ["https://tghsx.vercel.app/images/icons/icon-192x192.png"]
            }
        });

        walletConnectProvider.on('session_proposal', (proposal) => {
            console.log('[WalletConnect] Event: session_proposal received.', proposal);
        });

        walletConnectProvider.on('session_update', (params) => {
            if (!params || !params.namespaces) {
                console.warn('[WalletConnect] Skipping empty session_update payload');
                return;
            }
            console.log('[WalletConnect] Event: session_update received.', params);
        });

        walletConnectProvider.on('connect', (session) => {
            console.log('[WalletConnect] Event: connect received.', session);
            handleWalletConnectSession();
        });

        walletConnectProvider.on("disconnect", () => {
            console.log("[WalletConnect] Event: disconnect received.");
            resetWalletState();
        });

        console.log("WalletConnect Initialized Successfully.");
    } catch (e) {
        console.error("Fatal Error during WalletConnect initialization:", e);
        showToast("Could not start WalletConnect.", "error");
    }
}


/**
 * Handles the logic after a WalletConnect session is confirmed.
 */
async function handleWalletConnectSession() {
    console.log("Handling WalletConnect Session...");
    if (appState.userAccount) {
        console.log("Session already handled.");
        return;
    }
    appState.isConnecting = true;
    updateWalletUI();
    try {
        const accounts = walletConnectProvider.accounts;
        if (!accounts || accounts.length === 0) {
            throw new Error('No accounts found after WalletConnect session was established.');
        }
        console.log("WalletConnect Accounts:", accounts);

        appState.connectionType = 'walletconnect';
        localStorage.setItem('walletConnected', 'walletconnect');

        const provider = new ethers.providers.Web3Provider(walletConnectProvider);
        await setupProviderAndState(provider, accounts[0]);
        document.dispatchEvent(new Event('walletConnected'));
        document.dispatchEvent(new CustomEvent('accountChanged', { detail: accounts[0] }));
        document.dispatchEvent(new Event('networkConnected'));

    } catch (error) {
        console.error('Error processing WalletConnect session:', error);
        showToast(getErrorMessage(error), 'error');
        resetWalletState();
    } finally {
        appState.isConnecting = false;
        updateWalletUI();
    }
}

export function connectWallet() {
    const modal = document.getElementById('connectionModal');
    if (modal) modal.classList.add('show');
}

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

async function connectWithWalletConnect() {
    console.log("Attempting to connect with WalletConnect...");
    if (!walletConnectProvider) {
        console.log("WalletConnect provider not initialized, initializing now.");
        await initializeWalletConnect();
    }

    if (walletConnectProvider.session) {
        console.log("WalletConnect already connected. Handling session...");
        await handleWalletConnectSession();
        return;
    }

    appState.isConnecting = true;
    updateWalletUI();

    try {
        await walletConnectProvider.connect();
        console.log("WalletConnect connect() called. Awaiting user approval...");
    } catch (error) {
        console.error('Error during WalletConnect connection attempt:', error);
        if (!error.message.includes("Connection request reset")) {
            showToast(getErrorMessage(error), 'error');
        }
        resetWalletState();
    }
}

async function setupProviderAndState(provider, account) {
    console.log(`Setting up provider for account: ${account}`);
    appState.provider = provider;
    appState.signer = provider.getSigner();
    appState.userAccount = account;

    // This will now attempt to switch the chain if incorrect
    const isNetworkCorrect = await checkNetwork();
    
    if (isNetworkCorrect) {
        await initializeContracts();
        await fetchProtocolStatus();
        await saveWalletAddressToBackend(account);
        document.dispatchEvent(new CustomEvent('networkConnected'));
    }
    
    updateWalletUI();
    listenToProviderEvents();
}

function listenToProviderEvents() {
    const providerSource = appState.connectionType === 'metamask' ? window.ethereum : walletConnectProvider;
    if (!providerSource) return;

    if (typeof providerSource.removeAllListeners === 'function') {
        providerSource.removeAllListeners('accountsChanged');
        providerSource.removeAllListeners('chainChanged');
    }

    providerSource.on('accountsChanged', (accounts) => {
        console.log("Event: accountsChanged", accounts);
        if (accounts.length === 0) resetWalletState();
        else window.location.reload();
    });

    providerSource.on('chainChanged', () => {
        console.log("Event: chainChanged");
        window.location.reload();
    });
}

/**
 * Prompts the user to switch to the required blockchain network.
 * @returns {Promise<boolean>} - True if the switch was successful or not needed, false otherwise.
 */
async function switchChain() {
    const provider = appState.connectionType === 'metamask' ? window.ethereum : walletConnectProvider;
    if (!provider) return false;

    try {
        await provider.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: `0x${REQUIRED_CHAIN_ID.toString(16)}` }],
        });
        return true;
    } catch (switchError) {
        // This error code indicates that the chain has not been added to MetaMask.
        // In a real app, you would add the chain here.
        if (switchError.code === 4902) {
            showToast(`Please add ${NETWORKS[REQUIRED_CHAIN_ID]} to your wallet.`, 'error');
        } else {
            showToast('Failed to switch network. Please do it manually.', 'error');
        }
        console.error("Failed to switch chain:", switchError);
        return false;
    }
}

/**
 * Checks if the wallet is connected to the correct network. If not, it prompts the user to switch.
 * @returns {Promise<boolean>} - True if the network is correct, false otherwise.
 */
async function checkNetwork() {
    if (!appState.provider) return false;
    try {
        const network = await appState.provider.getNetwork();
        appState.networkName = NETWORKS[network.chainId] || `Unsupported (ID: ${network.chainId})`;
        
        if (network.chainId === REQUIRED_CHAIN_ID) {
            appState.isCorrectNetwork = true;
            return true;
        } else {
            appState.isCorrectNetwork = false;
            showToast(`Wrong network. Please switch to ${NETWORKS[REQUIRED_CHAIN_ID]}.`, 'warning');
            // Proactively ask the user to switch
            return await switchChain();
        }
    } catch (error) {
        console.error('Error checking network:', error);
        resetWalletState();
        return false;
    }
}


export async function disconnectWallet() {
    console.log("Disconnecting wallet...");
    if (appState.connectionType === 'walletconnect' && walletConnectProvider?.session) {
        await walletConnectProvider.disconnect();
    }
    resetWalletState();
    showToast('Wallet disconnected', 'info');
}

function resetWalletState() {
    console.log("Resetting wallet state.");
    appState.userAccount = null;
    appState.provider = null;
    appState.signer = null;
    appState.isCorrectNetwork = false;
    appState.networkName = null;
    appState.collateralVaultContract = null;
    appState.tghsxTokenContract = null;
    appState.isProtocolPaused = false;
    appState.connectionType = null;
    appState.isConnecting = false;

    localStorage.removeItem('walletConnected');
    updateWalletUI();
    document.dispatchEvent(new Event('walletDisconnected'));
}

async function checkForExistingConnection() {
    console.log("Checking for existing connection...");

    if (walletConnectProvider?.session && !appState.userAccount) {
        console.log("Found active WalletConnect session on check. Attempting to handle...");
        await handleWalletConnectSession();
        return; 
    }

    const connectionType = localStorage.getItem('walletConnected');
    if (!connectionType) return;

    if (connectionType === 'walletconnect') {
        if (!walletConnectProvider) await initializeWalletConnect();
        const sessions = await walletConnectProvider?.client?.core?.session?.getAll();
        if (sessions && sessions.length > 0 && !appState.userAccount) {
            console.log("Restoring WalletConnect session from persistent storage...");
            await handleWalletConnectSession();
        }

    } else if (connectionType === 'metamask' && window.ethereum) {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        if (accounts.length > 0) {
            console.log("Found existing MetaMask session.");
            await connectWithMetaMask();
        }
    }
}

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

async function fetchProtocolStatus() {
    if (!appState.collateralVaultContract) return;
    try {
        const isPaused = await appState.collateralVaultContract.paused();
        appState.isProtocolPaused = isPaused;
        document.dispatchEvent(new CustomEvent('protocolStatusUpdated', { detail: { isPaused } }));
    } catch (error) {
        console.error("Could not fetch protocol status:", error);
    }
}

async function saveWalletAddressToBackend(walletAddress) {
    const token = localStorage.getItem('accessToken');
    if (!token) return;
    try {
        await fetch(`${BACKEND_URL}/vault/save-wallet-address`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ wallet_address: walletAddress })
        });
    } catch (error) {
        console.error('Error saving wallet address:', error);
    }
}

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
    setTimeout(() => { window.location.href = './auth.html'; }, 1500);
}

let toastTimeout;
export function showToast(message, type = 'success') {
    const toast = document.getElementById('toastNotification');
    if (!toast) return;
    if (toastTimeout) clearTimeout(toastTimeout);
    toast.textContent = message;
    toast.className = `toast show ${type}`;
    toastTimeout = setTimeout(() => { toast.classList.remove('show'); }, 5000);
}

export function getErrorMessage(error) {
    if (error.code) {
        switch (error.code) {
            case 4001: return 'Transaction cancelled by user.';
            case 4902: return 'Network not added to wallet. Please add Polygon Amoy.';
            case -32603: return 'Internal JSON-RPC error. The contract may have rejected the transaction.';
            case -32002: return 'Request already pending. Please check your wallet.';
            case 'UNPREDICTABLE_GAS_LIMIT': return 'Transaction cannot be completed. The collateral ratio is likely out of the allowed range.';
            case 'INSUFFICIENT_FUNDS': return 'Your wallet has insufficient MATIC for this transaction, including gas fees.';
        }
    }
    if (error.message) {
        if (error.message.toLowerCase().includes('user rejected') || error.message.toLowerCase().includes('user denied')) return 'Transaction cancelled by user.';
        if (error.message.toLowerCase().includes('insufficient funds')) return 'Insufficient funds for transaction.';
    }
    return 'An unexpected error occurred. Please try again.';
}

function handleVisibilityChange() {
    if (!document.hidden && !appState.userAccount) {
        console.log('Page became visible, re-checking connection status.');
        checkForExistingConnection();
        setTimeout(() => {
            if (!appState.userAccount) {
                console.log('Retrying connection check after delay...');
                checkForExistingConnection();
            }
        }, 2000);
    }
}

function initializeApp() {
    console.log("Initializing App (DOM Loaded)...");
    const token = localStorage.getItem('accessToken');
    const onAuthPage = window.location.pathname.endsWith('auth.html');
    if (!token && !onAuthPage) {
        window.location.href = './auth.html';
        return;
    }

    document.getElementById('walletBtn')?.addEventListener('click', connectWallet);
    document.getElementById('logoutBtn')?.addEventListener('click', logoutUser);
    
    const connectMetaMaskBtn = document.getElementById('connectMetaMaskBtn');
    if (connectMetaMaskBtn) connectMetaMaskBtn.addEventListener('click', () => {
        document.getElementById('connectionModal').classList.remove('show');
        connectWithMetaMask();
    });

    const connectWalletConnectBtn = document.getElementById('connectWalletConnectBtn');
    if (connectWalletConnectBtn) connectWalletConnectBtn.addEventListener('click', () => {
        document.getElementById('connectionModal').classList.remove('show');
        connectWithWalletConnect();
    });

    const cancelConnectionBtn = document.getElementById('cancelConnectionBtn');
    if (cancelConnectionBtn) cancelConnectionBtn.addEventListener('click', () => {
        document.getElementById('connectionModal').classList.remove('show');
    });

    const menuToggle = document.getElementById('menu-toggle');
    const navMenu = document.getElementById('nav-menu');
    if (menuToggle && navMenu) {
        menuToggle.addEventListener('click', () => {
            navMenu.classList.toggle('active');
            const icon = menuToggle.querySelector('i');
            icon.classList.toggle('fa-bars', !navMenu.classList.contains('active'));
            icon.classList.toggle('fa-times', navMenu.classList.contains('active'));
        });
    }
    
    document.addEventListener('visibilitychange', handleVisibilityChange, false);
    
    window.addEventListener('focus', () => {
        console.log('[Focus] Checking for wallet session on refocus');
        if (!appState.userAccount || !appState.provider) {
            checkForExistingConnection();
        }
    });

    updateWalletUI();
    setInterval(fetchProtocolStatus, 60000); 
}

// --- Pre-DOM Initialization ---
(async () => {
  await initializeWalletConnect();
  await checkForExistingConnection();
})();

// --- DOM-Ready Initialization ---
document.addEventListener('DOMContentLoaded', () => {
  initializeApp();
});
