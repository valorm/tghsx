import { ethers } from "https://cdn.ethers.io/lib/ethers-5.2.esm.min.js";

// This module now manages a single, cached instance of the vault contract.
let vaultContractInstance = null;
let vaultContractAddress = null;

/**
 * Fetches the ABI for a given contract from the frontend's /abi directory.
 * @param {string} contractName The name of the contract (e.g., "CollateralVault").
 * @returns {Promise<object>} A promise that resolves to the contract's ABI.
 */
async function getContractAbi(contractName) {
    try {
        const response = await fetch(`/abi/${contractName}.json`);
        if (!response.ok) {
            throw new Error(`Failed to fetch ABI for ${contractName}. Status: ${response.status}`);
        }
        const data = await response.json();
        if (!data.abi) {
            throw new Error(`ABI not found in ${contractName}.json`);
        }
        return data.abi;
    } catch (error) {
        console.error(error);
        throw error;
    }
}

/**
 * Fetches a contract's address from the backend.
 * @param {string} contractName The name of the contract.
 * @returns {Promise<string>} A promise that resolves to the contract's address.
 */
async function getContractAddress(contractName) {
    try {
        const response = await fetch(`/api/v1/protocol/contract-address?name=${contractName}`);
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Failed to fetch contract address for ${contractName}`);
        }
        const data = await response.json();
        return data.address;
    } catch (error) {
        console.error(error);
        throw error;
    }
}

/**
 * Initializes and returns a cached instance of the CollateralVault contract.
 * @returns {Promise<ethers.Contract>} A promise that resolves to the ethers contract instance.
 */
async function getVaultContract() {
    if (vaultContractInstance) {
        return vaultContractInstance;
    }

    try {
        if (!window.ethereum) {
            throw new Error("MetaMask is not installed. Please install it to use this dApp.");
        }

        const address = await getContractAddress('CollateralVault');
        const abi = await getContractAbi('CollateralVault');
        
        vaultContractAddress = address; // Cache the address

        const provider = new ethers.providers.Web3Provider(window.ethereum);
        const signer = provider.getSigner();
        vaultContractInstance = new ethers.Contract(address, abi, signer);
        
        return vaultContractInstance;
    } catch (error) {
        console.error("Error initializing vault contract:", error);
        // You can add a UI notification here to inform the user.
        throw error;
    }
}

export async function getCollateralVaultAddress() {
    if (vaultContractAddress) {
        return vaultContractAddress;
    }
    await getVaultContract(); // This will initialize and cache the address
    return vaultContractAddress;
}

export async function getCollateralBalance(userAddress) {
    const contract = await getVaultContract();
    const balance = await contract.getCollateralBalance(userAddress);
    return ethers.utils.formatEther(balance);
}

export async function getVaultDetails(userAddress) {
    const contract = await getVaultContract();
    const details = await contract.vaults(userAddress);
    return {
        collateralAmount: ethers.utils.formatEther(details.collateralAmount),
        tghsxMinted: ethers.utils.formatEther(details.tghsxMinted)
    };
}

export async function depositCollateral(amount) {
    const contract = await getVaultContract();
    const tx = await contract.depositCollateral({ value: ethers.utils.parseEther(amount) });
    await tx.wait();
    return tx;
}

export async function withdrawCollateral(amount) {
    const contract = await getVaultContract();
    const tx = await contract.withdrawCollateral(ethers.utils.parseEther(amount));
    await tx.wait();
    return tx;
}

export async function mintTghsx(amount) {
    const contract = await getVaultContract();
    const tx = await contract.mintTghsx(ethers.utils.parseEther(amount));
    await tx.wait();
    return tx;
}

export async function burnTghsx(amount) {
    const contract = await getVaultContract();
    const tx = await contract.burnTghsx(ethers.utils.parseEther(amount));
    await tx.wait();
    return tx;
}

export async function liquidate(userAddress) {
    const contract = await getVaultContract();
    const tx = await contract.liquidate(userAddress);
    await tx.wait();
    return tx;
}

export async function getHealthFactor(userAddress) {
    const contract = await getVaultContract();
    const healthFactor = await contract.getHealthFactor(userAddress);
    // The health factor is returned as a large number, format it for display
    return ethers.utils.formatUnits(healthFactor, 18); // Assuming 18 decimals for health factor
}
