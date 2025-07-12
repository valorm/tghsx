# In /backend/routes/admin.py

import os
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import Dict, Any
from web3 import Web3
from web3.middleware import geth_poa_middleware
from decimal import Decimal

# Import project-specific services and utilities
from services.web3_client import get_web3_provider
from utils.utils import is_admin_user, load_contract_abi

# --- Router and Environment Setup ---
router = APIRouter()

COLLATERAL_VAULT_ADDRESS = os.getenv("COLLATERAL_VAULT_ADDRESS")
MINTER_PRIVATE_KEY = os.getenv("MINTER_PRIVATE_KEY")
if not COLLATERAL_VAULT_ADDRESS or not MINTER_PRIVATE_KEY:
    raise RuntimeError("Contract address or owner/minter key not set in environment.")

try:
    COLLATERAL_VAULT_ABI = load_contract_abi("abi/CollateralVault.json")
except Exception as e:
    raise RuntimeError(f"Failed to load CollateralVault ABI: {e}")

# --- Pydantic Models ---
class GhsPriceUpdateRequest(BaseModel):
    new_price: str

# --- Helper function to send a transaction ---
def send_admin_transaction(function_call):
    w3 = get_web3_provider()
    w3.middleware_onion.inject(geth_poa_middleware, layer=0)
    
    admin_account = w3.eth.account.from_key(MINTER_PRIVATE_KEY)
    
    try:
        gas_estimate = function_call.estimate_gas({'from': admin_account.address})
        gas_limit = int(gas_estimate * 1.2)
    except Exception as e:
        print(f"Gas estimation failed: {e}. Falling back to a default limit.")
        gas_limit = 200000

    tx_payload = {
        'from': admin_account.address,
        'nonce': w3.eth.get_transaction_count(admin_account.address),
        'gas': gas_limit,
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
    Fetches the current status of the CollateralVault contract, including the GHS price.
    """
    try:
        w3 = get_web3_provider()
        vault_contract = w3.eth.contract(address=Web3.to_checksum_address(COLLATERAL_VAULT_ADDRESS), abi=COLLATERAL_VAULT_ABI)
        
        is_paused = vault_contract.functions.paused().call()
        eth_usd_feed = vault_contract.functions.ethUsdPriceFeed().call()
        # --- NEW: Fetch the current GHS price from the contract ---
        ghs_price_raw = vault_contract.functions.ghsUsdPrice().call()
        # The price has 8 decimals, so we format it for display
        ghs_price_formatted = f"{(Decimal(ghs_price_raw) / Decimal('1e8')):.4f}"

        return {
            "isPaused": is_paused,
            "ethUsdPriceFeed": eth_usd_feed,
            "ghsUsdPrice": ghs_price_formatted
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch contract status: {str(e)}")

# --- NEW: Endpoint to update the GHS price ---
@router.post("/update-ghs-price", response_model=Dict[str, str], dependencies=[Depends(is_admin_user)])
async def update_ghs_price(request: GhsPriceUpdateRequest):
    """
    Calls the updateGhsPrice function on the CollateralVault contract.
    """
    try:
        w3 = get_web3_provider()
        vault_contract = w3.eth.contract(address=Web3.to_checksum_address(COLLATERAL_VAULT_ADDRESS), abi=COLLATERAL_VAULT_ABI)
        
        # Convert the price string to a Decimal for precision, then to the required integer format (with 8 decimals)
        new_price_decimal = Decimal(request.new_price)
        new_price_wei = int(new_price_decimal * (10**8))

        if new_price_wei <= 0:
            raise HTTPException(status_code=400, detail="Price must be a positive number.")

        function_call = vault_contract.functions.updateGhsPrice(new_price_wei)
        tx_hash = send_admin_transaction(function_call)
        
        return {"message": "GHS price updated successfully.", "transactionHash": tx_hash}
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid price format. Please enter a valid number.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update GHS price: {str(e)}")


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
