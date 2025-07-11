# In /backend/routes/admin.py

import os
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import Dict, Any
from web3 import Web3
# FIX: Import PoA middleware
from web3.middleware import geth_poa_middleware

# Import project-specific services and utilities
from services.web3_client import get_web3_provider
from utils.utils import is_admin_user, load_contract_abi

# --- Router and Environment Setup ---
router = APIRouter()

# Load contract details from environment variables
COLLATERAL_VAULT_ADDRESS = os.getenv("COLLATERAL_VAULT_ADDRESS")
MINTER_PRIVATE_KEY = os.getenv("MINTER_PRIVATE_KEY") # The owner key is needed for these actions
if not COLLATERAL_VAULT_ADDRESS or not MINTER_PRIVATE_KEY:
    raise RuntimeError("Contract address or owner/minter key not set in environment.")

# Load the contract ABI
try:
    COLLATERAL_VAULT_ABI = load_contract_abi("abi/CollateralVault.json")
except Exception as e:
    raise RuntimeError(f"Failed to load CollateralVault ABI: {e}")

# --- Helper function to send a transaction ---
def send_admin_transaction(function_call):
    w3 = get_web3_provider()
    # FIX: Inject PoA middleware to handle PoA chain specifics
    w3.middleware_onion.inject(geth_poa_middleware, layer=0)
    
    admin_account = w3.eth.account.from_key(MINTER_PRIVATE_KEY)
    
    tx_payload = {
        'from': admin_account.address,
        'nonce': w3.eth.get_transaction_count(admin_account.address),
        'gas': 200000, # Set a reasonable gas limit for admin functions
        'gasPrice': w3.eth.gas_price
    }
    
    tx = function_call.build_transaction(tx_payload)
    signed_tx = w3.eth.account.sign_transaction(tx, private_key=MINTER_PRIVATE_KEY)
    tx_hash = w3.eth.send_raw_transaction(signed_tx.rawTransaction)
    tx_receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)

    if tx_receipt['status'] == 0:
        raise Exception("On-chain transaction failed.")
    
    return tx_hash.hex()

# --- Admin Endpoints ---

@router.get("/status", response_model=Dict[str, Any], dependencies=[Depends(is_admin_user)])
async def get_contract_status():
    """
    Fetches the current status of the CollateralVault contract, including
    its paused state and immutable oracle addresses.
    """
    try:
        w3 = get_web3_provider()
        # FIX: Inject PoA middleware for read calls as well
        w3.middleware_onion.inject(geth_poa_middleware, layer=0)
        vault_contract = w3.eth.contract(address=Web3.to_checksum_address(COLLATERAL_VAULT_ADDRESS), abi=COLLATERAL_VAULT_ABI)
        
        is_paused = vault_contract.functions.paused().call()
        eth_usd_feed = vault_contract.functions.ethUsdPriceFeed().call()
        usd_ghs_feed = vault_contract.functions.usdGhsPriceFeed().call()
        
        return {
            "isPaused": is_paused,
            "ethUsdPriceFeed": eth_usd_feed,
            "usdGhsPriceFeed": usd_ghs_feed
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch contract status: {str(e)}")


@router.post("/pause", response_model=Dict[str, str], dependencies=[Depends(is_admin_user)])
async def pause_contract():
    """
    Calls the emergencyPause function on the CollateralVault contract.
    """
    try:
        w3 = get_web3_provider()
        vault_contract = w3.eth.contract(address=Web3.to_checksum_address(COLLATERAL_VAULT_ADDRESS), abi=COLLATERAL_VAULT_ABI)
        
        function_call = vault_contract.functions.emergencyPause()
        tx_hash = send_admin_transaction(function_call)
        
        return {"message": "Protocol paused successfully.", "transactionHash": tx_hash}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to pause protocol: {str(e)}")


@router.post("/unpause", response_model=Dict[str, str], dependencies=[Depends(is_admin_user)])
async def unpause_contract():
    """
    Calls the emergencyUnpause function on the CollateralVault contract.
    """
    try:
        w3 = get_web3_provider()
        vault_contract = w3.eth.contract(address=Web3.to_checksum_address(COLLATERAL_VAULT_ADDRESS), abi=COLLATERAL_VAULT_ABI)
        
        function_call = vault_contract.functions.emergencyUnpause()
        tx_hash = send_admin_transaction(function_call)

        return {"message": "Protocol resumed successfully.", "transactionHash": tx_hash}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to resume protocol: {str(e)}")
