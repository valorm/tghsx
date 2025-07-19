/**
 * ==================================================================================
 * Shared Wallet & App Logic (shared-wallet.js)
 *
 * This script manages the global state for the tGHSX application. It has been
 * updated to support the multi-collateral vault, fetch correct ABIs, and
 * align with the latest backend and smart contract architecture.
 * ==================================================================================
 */

import EthereumProvider from 'https://esm.sh/@walletconnect/ethereum-provider@2.13.0';

// --- Configuration ---
const NETWORKS = {
    80002: 'Polygon Amoy',
    137: 'Polygon Mainnet',
    31337: 'Localhost',
};
const REQUIRED_CHAIN_ID = 80002;
export const BACKEND_URL = 'https://tghsx.onrender.com';

// --- FIX: Updated Contract Addresses and ABIs ---
const COLLATERAL_VAULT_ADDRESS = "0x43842184d249247fA2393865942445163478294A"; // Correct address for the multi-collateral vault
const COLLATERAL_VAULT_ABI_PATH = './abi/CollateralVault.json'; // Path to the full ABI file
const ERC20_ABI_PATH = './abi/ERC20.json'; // Path to a standard ERC20 ABI

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
    // --- NEW: State for multi-collateral support ---
    supportedCollaterals: [], // Will be populated with { address, symbol, decimals }
    isProtocolPaused: false,
    connectionType: null,
    // --- NEW: ABIs will be loaded dynamically ---
    abis: {
        collateralVault: null,
        erc20: null,
    },
};

let walletConnectProvider = null;

// --- Helper Functions ---

/**
 * Loads ABI files from the server.
 * @param {string} path - The path to the ABI JSON file.
 * @returns {Promise<object>} The ABI object.
 */
async function loadAbi(path) {
    try {
        const response = await fetch(path);
        if (!response.ok) throw new Error(`Failed to load ABI from ${path}`);
        const artifact = await response.json();
        return artifact.abi; // Assuming Hardhat-style artifacts
    } catch (error) {
        console.error(error);
        showToast(`Critical Error: Could not load contract data.`, 'error');
        return null;
    }
}

// --- Wallet Connection & Initialization ---

async function initializeWalletConnect() {
    // This function remains largely the same, focusing on provider setup.
    try {
        const projectId = '4571f8b102cc836bdd761e9798a0e1f4'; // Replace with your WalletConnect Project ID
        walletConnectProvider = await EthereumProvider.init({
            projectId,
            chains: [REQUIRED_CHAIN_ID],
            showQrModal: true,
            qrModalOptions: { themeMode: "dark" },
            metadata: {
                name: "tGHSX Protocol",
                description: "The Synthetic Ghanaian Cedi, backed by Crypto.",
                url: window.location.origin,
                icons: [`${window.location.origin}/images/logo.png`]
            }
        });

        walletConnectProvider.on('connect', (session) => handleWalletConnectSession(session));
        walletConnectProvider.on("disconnect", () => resetWalletState());

    } catch (e) {
        console.error("Fatal Error during WalletConnect initialization:", e);
        showToast("Could not start WalletConnect.", "error");
    }
}

export function connectWallet() {
    document.getElementById('connectionModal')?.classList.add('show');
}

async function connectWithMetaMask() {
    if (typeof window.ethereum === 'undefined') {
        return showToast('MetaMask is not installed.', 'error');
    }
    appState.isConnecting = true;
    updateWalletUI();
    try {
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        appState.connectionType = 'metamask';
        localStorage.setItem('walletConnected', 'metamask');
        await setupProviderAndState(new ethers.providers.Web3Provider(window.ethereum), accounts[0]);
    } catch (error) {
        resetWalletState();
        showToast(getErrorMessage(error), 'error');
    } finally {
        appState.isConnecting = false;
        updateWalletUI();
    }
}

async function connectWithWalletConnect() {
    if (!walletConnectProvider) await initializeWalletConnect();
    if (walletConnectProvider.session) {
        await handleWalletConnectSession({ accounts: walletConnectProvider.accounts });
    } else {
        await walletConnectProvider.connect();
    }
}

async function handleWalletConnectSession({ accounts }) {
    appState.isConnecting = true;
    updateWalletUI();
    try {
        appState.connectionType = 'walletconnect';
        localStorage.setItem('walletConnected', 'walletconnect');
        const provider = new ethers.providers.Web3Provider(walletConnectProvider);
        await setupProviderAndState(provider, accounts[0]);
    } catch (error) {
        resetWalletState();
        showToast(getErrorMessage(error), 'error');
    } finally {
        appState.isConnecting = false;
        updateWalletUI();
    }
}

async function setupProviderAndState(provider, account) {
    appState.provider = provider;
    appState.signer = provider.getSigner();
    appState.userAccount = account;

    await checkNetwork();

    if (appState.isCorrectNetwork) {
        await initializeContracts();
        await fetchProtocolStatus();
        // --- FIX: Pass the default collateral address when saving the wallet ---
        // We'll use the first available collateral as the default.
        if (appState.supportedCollaterals.length > 0) {
            await saveWalletAddressToBackend(account, appState.supportedCollaterals[0].address);
        }
        document.dispatchEvent(new Event('networkConnected'));
    }
    updateWalletUI();
    listenToProviderEvents();
}

async function checkNetwork() {
    const network = await appState.provider.getNetwork();
    appState.isCorrectNetwork = network.chainId === REQUIRED_CHAIN_ID;
    appState.networkName = NETWORKS[network.chainId] || `Unsupported (ID: ${network.chainId})`;
    if (!appState.isCorrectNetwork) {
        showToast(`Please switch to ${NETWORKS[REQUIRED_CHAIN_ID]}.`, 'error');
    }
}

async function initializeContracts() {
    if (!appState.signer) return;
    try {
        // --- FIX: Use the full, dynamically loaded ABI ---
        appState.collateralVaultContract = new ethers.Contract(COLLATERAL_VAULT_ADDRESS, appState.abis.collateralVault, appState.signer);
        
        const tghsxTokenAddress = await appState.collateralVaultContract.tghsxToken();
        appState.tghsxTokenContract = new ethers.Contract(tghsxTokenAddress, appState.abis.erc20, appState.signer);

        // --- NEW: Fetch and populate the list of supported collateral tokens ---
        await fetchSupportedCollaterals();

    } catch (error) {
        console.error('Failed to initialize contracts:', error);
        showToast('Failed to connect to smart contracts.', 'error');
        resetWalletState();
    }
}

/**
 * NEW: Fetches the list of supported collateral assets from the vault contract.
 */
async function fetchSupportedCollaterals() {
    if (!appState.collateralVaultContract) return;
    try {
        const tokenAddresses = await appState.collateralVaultContract.getAllCollateralTokens();
        const collateralPromises = tokenAddresses.map(async (address) => {
            const tokenContract = new ethers.Contract(address, appState.abis.erc20, appState.provider);
            const [symbol, decimals] = await Promise.all([
                tokenContract.symbol(),
                tokenContract.decimals()
            ]);
            return { address, symbol, decimals };
        });
        appState.supportedCollaterals = await Promise.all(collateralPromises);
    } catch (error) {
        console.error("Failed to fetch supported collaterals:", error);
        showToast("Could not load collateral token list.", 'error');
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

/**
 * FIX: The backend now requires a default collateral address.
 */
async function saveWalletAddressToBackend(walletAddress, defaultCollateralAddress) {
    const token = localStorage.getItem('accessToken');
    if (!token) return;
    try {
        await fetch(`${BACKEND_URL}/vault/save-wallet-address`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ 
                wallet_address: walletAddress,
                default_collateral_address: defaultCollateralAddress
            })
        });
    } catch (error) {
        console.error('Error saving wallet address:', error);
    }
}

function listenToProviderEvents() {
    const providerSource = appState.connectionType === 'metamask' ? window.ethereum : walletConnectProvider;
    if (!providerSource) return;

    providerSource.removeAllListeners?.();
    providerSource.on('accountsChanged', () => window.location.reload());
    providerSource.on('chainChanged', () => window.location.reload());
}

export function disconnectWallet() {
    if (appState.connectionType === 'walletconnect' && walletConnectProvider?.session) {
        walletConnectProvider.disconnect();
    }
    resetWalletState();
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
    appState.connectionType = null;
    appState.isConnecting = false;
    appState.supportedCollaterals = [];
    localStorage.removeItem('walletConnected');
    updateWalletUI();
    document.dispatchEvent(new Event('walletDisconnected'));
}

async function checkForExistingConnection() {
    const connectionType = localStorage.getItem('walletConnected');
    if (!connectionType) return;

    if (connectionType === 'metamask' && window.ethereum) {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        if (accounts.length > 0) await connectWithMetaMask();
    } else if (connectionType === 'walletconnect') {
        if (!walletConnectProvider) await initializeWalletConnect();
        if (walletConnectProvider.session) await handleWalletConnectSession({ accounts: walletConnectProvider.accounts });
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

// --- Exported Utility Functions ---
export function formatAddress(address, length = 6) {
    if (!address || address.length < 10) return '';
    return `${address.slice(0, length)}...${address.slice(-4)}`;
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
    clearTimeout(toastTimeout);
    toast.textContent = message;
    toast.className = `toast show ${type}`;
    toastTimeout = setTimeout(() => toast.classList.remove('show'), 5000);
}

export function getErrorMessage(error) {
    console.error(error); // Log the full error for debugging
    if (error.code) {
        switch (error.code) {
            case 4001: return 'Transaction cancelled by user.';
            case 'UNPREDICTABLE_GAS_LIMIT': return 'Transaction cannot be completed. The collateral ratio may be too low or another contract requirement was not met.';
            case 'INSUFFICIENT_FUNDS': return 'Insufficient MATIC for gas fees.';
        }
    }
    if (error.data && error.data.message) {
        return error.data.message;
    }
    if(error.reason) return error.reason;
    if (error.message) return error.message;
    return 'An unexpected error occurred.';
}

// --- App Initialization ---
async function initializeApp() {
    const token = localStorage.getItem('accessToken');
    const onAuthPage = window.location.pathname.includes('auth.html');
    if (!token && !onAuthPage) {
        window.location.href = './auth.html';
        return;
    }

    // --- NEW: Load all ABIs at the start ---
    [appState.abis.collateralVault, appState.abis.erc20] = await Promise.all([
        loadAbi(COLLATERAL_VAULT_ABI_PATH),
        loadAbi(ERC20_ABI_PATH)
    ]);

    // Setup UI event listeners
    document.getElementById('walletBtn')?.addEventListener('click', connectWallet);
    document.getElementById('logoutBtn')?.addEventListener('click', logoutUser);
    document.getElementById('connectMetaMaskBtn')?.addEventListener('click', () => {
        document.getElementById('connectionModal').classList.remove('show');
        connectWithMetaMask();
    });
    document.getElementById('connectWalletConnectBtn')?.addEventListener('click', () => {
        document.getElementById('connectionModal').classList.remove('show');
        connectWithWalletConnect();
    });
    document.getElementById('cancelConnectionBtn')?.addEventListener('click', () => {
        document.getElementById('connectionModal').classList.remove('show');
    });

    await initializeWalletConnect();
    await checkForExistingConnection();
    updateWalletUI();
}

document.addEventListener('DOMContentLoaded', initializeApp);
