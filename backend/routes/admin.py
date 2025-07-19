# In /backend/routes/admin.py

import os
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import Dict, Any
from web3 import Web3
from web3.middleware import geth_poa_middleware

from services.web3_client import get_web3_provider
from utils.utils import is_admin_user, load_contract_abi, send_admin_transaction

# --- Router and Environment Setup ---
router = APIRouter()
COLLATERAL_VAULT_ADDRESS = os.getenv("COLLATERAL_VAULT_ADDRESS")
COLLATERAL_VAULT_ABI = load_contract_abi("abi/CollateralVault.json")

# --- NEW: Pydantic Model for Auto-Mint Config ---
class AutoMintConfigPayload(BaseModel):
    baseReward: int
    bonusMultiplier: int
    minHoldTime: int
    collateralRequirement: int

# --- Admin Endpoints ---

# get_contract_status, pause_contract, unpause_contract remain the same...

# --- NEW: Endpoints for managing Auto-Mint ---

@router.get("/automint-config", response_model=Dict[str, Any], dependencies=[Depends(is_admin_user)])
async def get_automint_config():
    """Fetches the current AutoMint configuration from the vault."""
    try:
        w3 = get_web3_provider()
        vault_contract = w3.eth.contract(address=Web3.to_checksum_address(COLLATERAL_VAULT_ADDRESS), abi=COLLATERAL_VAULT_ABI)
        
        config = vault_contract.functions.autoMintConfig().call()
        is_enabled = vault_contract.functions.autoMintEnabled().call()
        
        return {
            "isEnabled": is_enabled,
            "baseReward": str(config[0]),
            "bonusMultiplier": config[1],
            "minHoldTime": config[2],
            "collateralRequirement": str(config[3])
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch auto-mint config: {str(e)}")

@router.post("/toggle-automint", response_model=Dict[str, str], dependencies=[Depends(is_admin_user)])
async def toggle_automint(enabled: bool):
    """Enables or disables the Auto-Mint feature."""
    try:
        w3 = get_web3_provider()
        vault_contract = w3.eth.contract(address=Web3.to_checksum_address(COLLATERAL_VAULT_ADDRESS), abi=COLLATERAL_VAULT_ABI)
        
        function_call = vault_contract.functions.toggleAutoMint(enabled)
        tx_hash = send_admin_transaction(function_call)
        
        status_text = "enabled" if enabled else "disabled"
        return {"message": f"Auto-Mint feature has been {status_text}.", "transactionHash": tx_hash}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to toggle Auto-Mint: {str(e)}")

@router.post("/update-automint-config", response_model=Dict[str, str], dependencies=[Depends(is_admin_user)])
async def update_automint_config(payload: AutoMintConfigPayload):
    """Updates the parameters for the Auto-Mint feature."""
    try:
        w3 = get_web3_provider()
        vault_contract = w3.eth.contract(address=Web3.to_checksum_address(COLLATERAL_VAULT_ADDRESS), abi=COLLATERAL_VAULT_ABI)
        
        function_call = vault_contract.functions.updateAutoMintConfig(
            payload.baseReward,
            payload.bonusMultiplier,
            payload.minHoldTime,
            payload.collateralRequirement
        )
        tx_hash = send_admin_transaction(function_call)
        
        return {"message": "Auto-Mint configuration updated successfully.", "transactionHash": tx_hash}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update Auto-Mint config: {str(e)}")

