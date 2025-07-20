# In /backend/routes/admin.py

import os
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, validator
from typing import Dict, Any
from web3 import Web3
from web3.middleware import geth_poa_middleware

from services.web3_client import get_web3_provider
from utils.utils import is_admin_user, load_contract_abi
from services.web3_service import send_admin_transaction

# --- Router and Environment Setup ---
router = APIRouter()
COLLATERAL_VAULT_ADDRESS = os.getenv("COLLATERAL_VAULT_ADDRESS")
COLLATERAL_VAULT_ABI = load_contract_abi("abi/CollateralVault.json")

# --- FIX: Constants from CollateralVault contract for validation ---
PRECISION = 10**6
MAX_SINGLE_MINT = 1000 * PRECISION
MAX_BONUS_MULTIPLIER = 5000
MAX_HOLD_TIME = 86400  # 24 hours in seconds
# MIN_COLLATERAL_RATIO is 150%, stored as 150 * 10**4, so we adjust for PRECISION
MIN_COLLATERAL_RATIO_VALUE = 150

# --- FIX: Pydantic Model with validation and human-readable units ---
class AutoMintConfigPayload(BaseModel):
    baseReward: float  # Accept human-readable values (e.g., 10.0 for 10 tGHSX)
    bonusMultiplier: int
    minHoldTime: int
    collateralRequirement: float  # Accept percentage (e.g., 200.0 for 200%)

    @validator('baseReward')
    def validate_base_reward(cls, v):
        if v <= 0 or (v * PRECISION) > MAX_SINGLE_MINT:
            raise ValueError(f"Base Reward must be > 0 and <= {MAX_SINGLE_MINT / PRECISION}")
        return v

    @validator('bonusMultiplier')
    def validate_bonus_multiplier(cls, v):
        if v < 0 or v > MAX_BONUS_MULTIPLIER:
            raise ValueError(f"Bonus Multiplier must be between 0 and {MAX_BONUS_MULTIPLIER}")
        return v

    @validator('minHoldTime')
    def validate_min_hold_time(cls, v):
        if v < 0 or v > MAX_HOLD_TIME:
            raise ValueError(f"Min Hold Time must be between 0 and {MAX_HOLD_TIME} seconds")
        return v

    @validator('collateralRequirement')
    def validate_collateral_requirement(cls, v):
        if v < MIN_COLLATERAL_RATIO_VALUE:
            raise ValueError(f"Collateral Requirement must be >= {MIN_COLLATERAL_RATIO_VALUE}%")
        return v

# --- Admin Endpoints ---

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


@router.get("/automint-config", response_model=Dict[str, Any], dependencies=[Depends(is_admin_user)])
async def get_automint_config():
    """Fetches the current AutoMint configuration from the vault."""
    try:
        w3 = get_web3_provider()
        vault_contract = w3.eth.contract(address=Web3.to_checksum_address(COLLATERAL_VAULT_ADDRESS), abi=COLLATERAL_VAULT_ABI)
        
        config = vault_contract.functions.autoMintConfig().call()
        is_enabled = vault_contract.functions.autoMintEnabled().call()
        
        # FIX: Normalize response to return human-readable numbers
        return {
            "isEnabled": is_enabled,
            "baseReward": config[0] / PRECISION,  # Convert to human-readable (e.g., 10.0)
            "bonusMultiplier": config[1],
            "minHoldTime": config[2],
            "collateralRequirement": config[3] # The contract stores this as a direct percentage (e.g., 200 for 200%)
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
        
        # FIX: Convert human-readable values to contract units
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
