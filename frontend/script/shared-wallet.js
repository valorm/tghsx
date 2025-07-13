import { ethers } from "https://cdn.ethers.io/lib/ethers-5.2.esm.min.js";

// --- Configuration ---
// The base URL for your backend API.
const API_BASE_URL = "https://tghsx.onrender.com"; 

// --- Module State ---
let vaultContractInstance = null;
let vaultContractAddress = null;
let provider = null;
let signer = null;

/**
 * Fetches the ABI for a given contract name.
 * @param {string} contractName The name of the contract (e.g., "CollateralVault").
 * @returns {Promise<object>} The contract's ABI.
 */
async function getContractAbi(contractName) {
    const response = await fetch(`/abi/${contractName}.json`);
    if (!response.ok) throw new Error(`Failed to fetch ABI for ${contractName}`);
    const data = await response.json();
    if (!data.abi) throw new Error(`ABI not found in ${contractName}.json`);
    return data.abi;
}

/**
 * Fetches a contract's address from the backend.
 * @param {string} contractName The name of the contract.
 * @returns {Promise<string>} The contract's address.
 */
async function getContractAddress(contractName) {
    const response = await fetch(`${API_BASE_URL}/api/v1/protocol/contract-address?name=${contractName}`);
    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to fetch address for ${contractName}`);
    }
    const data = await response.json();
    return data.address;
}

/**
 * Saves the user's wallet address to the backend database.
 * @param {string} walletAddress The user's Ethereum wallet address.
 */
async function saveWalletAddressToBackend(walletAddress) {
    const token = localStorage.getItem('accessToken');
    if (!token) {
        console.warn("No access token found. Cannot save wallet address.");
        return;
    }

    try {
        // Corrected the API endpoint to include the full path
        const response = await fetch(`${API_BASE_URL}/api/v1/vault/save-wallet-address`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ wallet_address: walletAddress })
        });

        if (!response.ok) {
            // If the response is not OK, parse the error message from the body
            const errorData = await response.json();
            throw new Error(errorData.error || `Server responded with status: ${response.status}`);
        }

        console.log("Wallet address saved to backend successfully.");

    } catch (error) {
        // Catch network errors and errors thrown from the response check
        console.error("Error saving wallet address:", error);
        // This was the source of the ReferenceError, now it's fixed.
        // We re-throw the error so the calling function knows something went wrong.
        throw error;
    }
}


/**
 * Initializes and returns a cached instance of the CollateralVault contract.
 * @returns {Promise<ethers.Contract>} The ethers contract instance.
 */
export async function getVaultContract() {
    if (vaultContractInstance) return vaultContractInstance;

    try {
        if (!window.ethereum) throw new Error("MetaMask is not installed.");

        const address = await getContractAddress('CollateralVault');
        const abi = await getContractAbi('CollateralVault');
        
        vaultContractAddress = address;

        provider = new ethers.providers.Web3Provider(window.ethereum);
        signer = provider.getSigner();
        vaultContractInstance = new ethers.Contract(address, abi, signer);
        
        // After initializing, save the connected wallet address
        const userAddress = await signer.getAddress();
        await saveWalletAddressToBackend(userAddress);

        return vaultContractInstance;

    } catch (error) {
        console.error("Error initializing vault contract:", error);
        throw error;
    }
}

// --- Exported Functions ---

export async function connectWallet() {
    if (!window.ethereum) {
        alert("Please install MetaMask to use this feature.");
        return;
    }
    try {
        await window.ethereum.request({ method: 'eth_requestAccounts' });
        await getVaultContract(); // This will initialize and save the address
        location.reload(); // Reload to reflect connected state
    } catch (error) {
        console.error("Error connecting wallet:", error);
    }
}

export async function disconnectWallet() {
    // While you can't truly "disconnect" from MetaMask via a dApp,
    // we can clear our local state to simulate it.
    localStorage.removeItem('walletConnected');
    vaultContractInstance = null;
    provider = null;
    signer = null;
    console.log("Wallet state cleared.");
    location.reload();
}

export async function getCollateralVaultAddress() {
    if (vaultContractAddress) return vaultContractAddress;
    await getVaultContract();
    return vaultContractAddress;
}

// ... other contract interaction functions (getCollateralBalance, etc.)
