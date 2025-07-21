# In /backend/routes/admin.py

import os
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, validator
from typing import Dict, Any, List
from web3 import Web3
from web3.middleware import geth_poa_middleware

from services.web3_client import get_web3_provider
# FIX: Import the supabase client to query the database
from services.supabase_client import get_supabase_admin_client
from utils.utils import is_admin_user, load_contract_abi
from services.web3_service import send_admin_transaction

# --- Router and Environment Setup ---
router = APIRouter()
COLLATERAL_VAULT_ADDRESS = os.getenv("COLLATERAL_VAULT_ADDRESS")
COLLATERAL_VAULT_ABI = load_contract_abi("abi/CollateralVault.json")

# --- Constants for validation ---
PRECISION = 10**6
MAX_SINGLE_MINT = 1000 * PRECISION
MAX_BONUS_MULTIPLIER = 5000
MAX_HOLD_TIME = 86400  # 24 hours in seconds
MIN_COLLATERAL_RATIO_VALUE = 150

# --- Pydantic Models ---
class AutoMintConfigPayload(BaseModel):
    baseReward: float
    bonusMultiplier: int
    minHoldTime: int
    collateralRequirement: float

    @validator('baseReward')
    def validate_base_reward(cls, v):
        if v <= 0 or (v * PRECISION) > MAX_SINGLE_MINT:
            raise ValueError(f"Base Reward must be > 0 and <= {MAX_SINGLE_MINT / PRECISION}")
        return v
    # ... (other validators remain the same)

class CollateralActionRequest(BaseModel):
    collateral_address: str

    @validator('collateral_address')
    def validate_address(cls, v):
        if not Web3.is_address(v):
            raise ValueError("Invalid Ethereum address")
        return Web3.to_checksum_address(v)

# --- Admin Endpoints ---

# --- NEW: Endpoint to get all pending mint requests ---
@router.get("/pending-requests", response_model=List[Dict[str, Any]], dependencies=[Depends(is_admin_user)])
async def get_all_pending_requests(supabase = Depends(get_supabase_admin_client)):
    """
    Fetches all mint requests with a 'pending' status for admin review.
    """
    try:
        response = supabase.table("mint_requests").select("*").eq("status", "pending").order("created_at", desc=True).execute()
        return response.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch pending mint requests: {str(e)}")


@router.get("/status", response_model=Dict[str, Any], dependencies=[Depends(is_admin_user)])
async def get_contract_status():
    """
    Fetches the current global status of the CollateralVault contract.
    """
    try:
        w3 = get_web3_provider()
        w3.middleware_onion.inject(geth_poa_middleware, layer=0)
        vault_contract = w3.eth.contract(address=Web3.to_checksum_address(COLLATERAL_VAULT_ADDRESS), abi=COLLATERAL_VAULT_ABI)
        status_data = vault_contract.functions.getVaultStatus().call()
        return {
            "totalMintedGlobal": str(status_data[0]),
            "globalDailyMinted": str(status_data[1]),
            "globalDailyRemaining": str(status_data[2]),
            "isAutoMintEnabled": status_data[3],
            "isPaused": status_data[4],
            "totalCollateralTypes": status_data[5]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch contract status: {str(e)}")

# ... (rest of the file remains the same)

@router.post("/pause", response_model=Dict[str, str], dependencies=[Depends(is_admin_user)])
async def pause_contract():
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
    try:
        w3 = get_web3_provider()
        vault_contract = w3.eth.contract(address=Web3.to_checksum_address(COLLATERAL_VAULT_ADDRESS), abi=COLLATERAL_VAULT_ABI)
        function_call = vault_contract.functions.emergencyUnpause()
        tx_hash = send_admin_transaction(function_call)
        return {"message": "Protocol resumed successfully.", "transactionHash": tx_hash}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to resume protocol: {str(e)}")


@router.get("/automint-config", response_model=Dict[str, Any], dependencies=[Depends(is_admin_user)])
async def get_automint_config():
    try:
        w3 = get_web3_provider()
        vault_contract = w3.eth.contract(address=Web3.to_checksum_address(COLLATERAL_VAULT_ADDRESS), abi=COLLATERAL_VAULT_ABI)
        config = vault_contract.functions.autoMintConfig().call()
        is_enabled = vault_contract.functions.autoMintEnabled().call()
        return {
            "isEnabled": is_enabled,
            "baseReward": config[0] / PRECISION,
            "bonusMultiplier": config[1],
            "minHoldTime": config[2],
            "collateralRequirement": config[3]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch auto-mint config: {str(e)}")

@router.post("/toggle-automint", response_model=Dict[str, str], dependencies=[Depends(is_admin_user)])
async def toggle_automint(enabled: bool):
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
    try:
        w3 = get_web3_provider()
        vault_contract = w3.eth.contract(address=Web3.to_checksum_address(COLLATERAL_VAULT_ADDRESS), abi=COLLATERAL_VAULT_ABI)
        base_reward_units = int(payload.baseReward * PRECISION)
        function_call = vault_contract.functions.updateAutoMintConfig(
            base_reward_units,
            payload.bonusMultiplier,
            payload.minHoldTime,
            int(payload.collateralRequirement)
        )
        tx_hash = send_admin_transaction(function_call)
        return {"message": "Auto-Mint configuration updated successfully.", "transactionHash": tx_hash}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update Auto-Mint config: {str(e)}")

@router.post("/disable-collateral", response_model=Dict[str, str], dependencies=[Depends(is_admin_user)])
async def disable_collateral_type(request: CollateralActionRequest):
    try:
        w3 = get_web3_provider()
        vault_contract = w3.eth.contract(address=Web3.to_checksum_address(COLLATERAL_VAULT_ADDRESS), abi=COLLATERAL_VAULT_ABI)
        function_call = vault_contract.functions.updateCollateralEnabled(
            request.collateral_address,
            False
        )
        tx_hash = send_admin_transaction(function_call)
        return {"message": f"Collateral type {request.collateral_address} disabled successfully.", "transactionHash": tx_hash}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to disable collateral: {str(e)}")
