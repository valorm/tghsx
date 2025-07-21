# /backend/routes/admin.py
import os
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, validator
from typing import Dict, Any, List
from web3 import Web3
from web3.middleware import geth_poa_middleware

from services.web3_client import get_web3_provider
from services.supabase_client import get_supabase_admin_client
from utils.utils import is_admin_user, load_contract_abi
from services.web3_service import send_admin_transaction

# --- Router and Environment Setup ---
# FIX: Removed prefix="/admin" to prevent double prefixing. main.py now handles this.
router = APIRouter(tags=["Admin"])
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
            raise ValueError(f"BaseReward must be >0 and <= {MAX_SINGLE_MINT / PRECISION}")
        return v

    @validator('bonusMultiplier')
    def validate_bonus_multiplier(cls, v):
        if v < 0 or v > MAX_BONUS_MULTIPLIER:
            raise ValueError(f"bonusMultiplier must be between 0 and {MAX_BONUS_MULTIPLIER}")
        return v

    @validator('minHoldTime')
    def validate_min_hold_time(cls, v):
        if v < 0 or v > MAX_HOLD_TIME:
            raise ValueError(f"minHoldTime must be between 0 and {MAX_HOLD_TIME} seconds")
        return v

    @validator('collateralRequirement')
    def validate_collateral_requirement(cls, v):
        if v < MIN_COLLATERAL_RATIO_VALUE:
            raise ValueError(f"collateralRequirement must be >= {MIN_COLLATERAL_RATIO_VALUE}%")
        return v

class CollateralActionRequest(BaseModel):
    collateral_address: str

    @validator('collateral_address')
    def validate_address(cls, v):
        if not Web3.is_address(v):
            raise ValueError("Invalid Ethereum address")
        return Web3.to_checksum_address(v)

# --- Admin Endpoints ---

@router.get(
    "/pending-requests", 
    response_model=List[Dict[str, Any]], 
    dependencies=[Depends(is_admin_user)]
)
async def get_all_pending_requests(
    supabase = Depends(get_supabase_admin_client)
):
    """
    Fetches all mint requests with a 'pending' status for admin review.
    """
    try:
        resp = supabase.table("mint_requests").select("*") \
                      .eq("status", "pending").order("created_at", desc=True).execute()
        return resp.data
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch pending mint requests: {str(e)}"
        )

@router.get(
    "/status", 
    response_model=Dict[str, Any], 
    dependencies=[Depends(is_admin_user)]
)
async def get_contract_status():
    """
    Fetches the current global status of the CollateralVault contract.
    """
    try:
        w3 = get_web3_provider()
        w3.middleware_onion.inject(geth_poa_middleware, layer=0)
        vault = w3.eth.contract(
            address=Web3.to_checksum_address(COLLATERAL_VAULT_ADDRESS), 
            abi=COLLATERAL_VAULT_ABI
        )
        data = vault.functions.getVaultStatus().call()
        return {
            "totalMintedGlobal": str(data[0]),
            "globalDailyMinted": str(data[1]),
            "globalDailyRemaining": str(data[2]),
            "isAutoMintEnabled": data[3],
            "isPaused": data[4],
            "totalCollateralTypes": data[5]
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch contract status: {str(e)}"
        )

@router.post(
    "/pause", 
    response_model=Dict[str, str], 
    dependencies=[Depends(is_admin_user)]
)
async def pause_contract():
    """Pause the protocol via emergencyPause()."""
    try:
        w3 = get_web3_provider()
        vault = w3.eth.contract(
            address=Web3.to_checksum_address(COLLATERAL_VAULT_ADDRESS), 
            abi=COLLATERAL_VAULT_ABI
        )
        fn = vault.functions.emergencyPause()
        tx_hash = send_admin_transaction(fn)
        return {"message": "Protocol paused successfully.", "transactionHash": tx_hash}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to pause protocol: {str(e)}"
        )

@router.post(
    "/unpause", 
    response_model=Dict[str, str], 
    dependencies=[Depends(is_admin_user)]
)
async def unpause_contract():
    """Resume the protocol via emergencyUnpause()."""
    try:
        w3 = get_web3_provider()
        vault = w3.eth.contract(
            address=Web3.to_checksum_address(COLLATERAL_VAULT_ADDRESS), 
            abi=COLLATERAL_VAULT_ABI
        )
        fn = vault.functions.emergencyUnpause()
        tx_hash = send_admin_transaction(fn)
        return {"message": "Protocol resumed successfully.", "transactionHash": tx_hash}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to resume protocol: {str(e)}"
        )

@router.get(
    "/automint-config", 
    response_model=Dict[str, Any], 
    dependencies=[Depends(is_admin_user)]
)
async def get_automint_config():
    """Retrieve the auto-mint configuration."""
    try:
        w3 = get_web3_provider()
        vault = w3.eth.contract(
            address=Web3.to_checksum_address(COLLATERAL_VAULT_ADDRESS), 
            abi=COLLATERAL_VAULT_ABI
        )
        cfg = vault.functions.autoMintConfig().call()
        enabled = vault.functions.autoMintEnabled().call()
        return {
            "isEnabled": enabled,
            "baseReward": cfg[0] / PRECISION,
            "bonusMultiplier": cfg[1],
            "minHoldTime": cfg[2],
            "collateralRequirement": cfg[3]
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch auto-mint config: {str(e)}"
        )

@router.post(
    "/toggle-automint", 
    response_model=Dict[str, str], 
    dependencies=[Depends(is_admin_user)]
)
async def toggle_automint(enabled: bool):
    """Enable or disable the auto-mint feature."""
    try:
        w3 = get_web3_provider()
        vault = w3.eth.contract(
            address=Web3.to_checksum_address(COLLATERAL_VAULT_ADDRESS), 
            abi=COLLATERAL_VAULT_ABI
        )
        fn = vault.functions.toggleAutoMint(enabled)
        tx_hash = send_admin_transaction(fn)
        status_text = "enabled" if enabled else "disabled"
        return {"message": f"Auto-Mint has been {status_text}.", "transactionHash": tx_hash}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to toggle Auto-Mint: {str(e)}"
        )

@router.post(
    "/update-automint-config", 
    response_model=Dict[str, str], 
    dependencies=[Depends(is_admin_user)]
)
async def update_automint_config(payload: AutoMintConfigPayload):
    """Update the auto-mint configuration parameters."""
    try:
        w3 = get_web3_provider()
        vault = w3.eth.contract(
            address=Web3.to_checksum_address(COLLATERAL_VAULT_ADDRESS), 
            abi=COLLATERAL_VAULT_ABI
        )
        reward_units = int(payload.baseReward * PRECISION)
        fn = vault.functions.updateAutoMintConfig(
            reward_units,
            payload.bonusMultiplier,
            payload.minHoldTime,
            int(payload.collateralRequirement)
        )
        tx_hash = send_admin_transaction(fn)
        return {"message": "Auto-Mint configuration updated.", "transactionHash": tx_hash}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update Auto-Mint config: {str(e)}"
        )

@router.post(
    "/disable-collateral", 
    response_model=Dict[str, str], 
    dependencies=[Depends(is_admin_user)]
)
async def disable_collateral_type(request: CollateralActionRequest):
    """Disable a collateral type so users can no longer deposit it."""
    try:
        w3 = get_web3_provider()
        vault = w3.eth.contract(
            address=Web3.to_checksum_address(COLLATERAL_VAULT_ADDRESS), 
            abi=COLLATERAL_VAULT_ABI
        )
        fn = vault.functions.updateCollateralEnabled(request.collateral_address, False)
        tx_hash = send_admin_transaction(fn)
        return {"message": f"Collateral {request.collateral_address} disabled.", "transactionHash": tx_hash}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to disable collateral: {str(e)}"
        )
