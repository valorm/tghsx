# In /backend/routes/vault.py

import os
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import Dict, Any
from web3 import Web3

# Corrected Import Paths
from services.web3_client import get_web3_provider
from services.supabase_client import get_supabase_admin_client
from utils.utils import get_current_user, load_contract_abi

# --- Router and Environment Setup ---
router = APIRouter()
COLLATERAL_VAULT_ADDRESS = os.getenv("COLLATERAL_VAULT_ADDRESS")
COLLATERAL_VAULT_ABI = load_contract_abi("abi/CollateralVault.json")

# --- Pydantic Models ---
class SaveWalletRequest(BaseModel):
    wallet_address: str
    # FIX: User should specify which collateral they are primarily using or viewing
    default_collateral_address: str 

class VaultStatusResponse(BaseModel):
    collateralAmount: str
    mintedAmount: str
    collateralValueUSD: str
    collateralRatio: str
    isLiquidatable: bool
    lastUpdateTime: int

# --- Vault Endpoints ---
@router.get("/status/{collateral_address}", response_model=VaultStatusResponse)
async def get_onchain_vault_status(
    collateral_address: str,
    user: dict = Depends(get_current_user),
    supabase = Depends(get_supabase_admin_client)
):
    user_id = user.get("sub")
    try:
        user_res = supabase.from_("profiles").select("wallet_address").eq("id", user_id).single().execute()

        if not user_res.data or not user_res.data.get("wallet_address"):
            # Return a default zero-state if user has no wallet saved
            return VaultStatusResponse(collateralAmount="0", mintedAmount="0", collateralValueUSD="0", collateralRatio="0", isLiquidatable=False, lastUpdateTime=0)
        
        w3 = get_web3_provider()
        vault_contract = w3.eth.contract(address=Web3.to_checksum_address(COLLATERAL_VAULT_ADDRESS), abi=COLLATERAL_VAULT_ABI)
        
        # FIX: Correctly call getUserPosition and handle its return tuple.
        # It returns (collateralAmount, mintedAmount, collateralValue, collateralRatio, isLiquidatable, lastUpdateTime)
        position_data = vault_contract.functions.getUserPosition(
            Web3.to_checksum_address(user_res.data["wallet_address"]),
            Web3.to_checksum_address(collateral_address)
        ).call()

        # The contract returns values with 6 decimals of precision
        tghsx_decimals = 6
        
        return VaultStatusResponse(
            collateralAmount=str(position_data[0]), # Amount in smallest unit (e.g., wei)
            mintedAmount=str(Decimal(position_data[1]) / Decimal(10**tghsx_decimals)),
            collateralValueUSD=str(Decimal(position_data[2]) / Decimal(10**tghsx_decimals)),
            collateralRatio=str(Decimal(position_data[3]) / Decimal(10**tghsx_decimals)),
            isLiquidatable=position_data[4],
            lastUpdateTime=position_data[5]
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve vault status: {e}")

@router.post("/save-wallet-address")
async def save_wallet_address(
    request: SaveWalletRequest,
    user: dict = Depends(get_current_user)
):
    user_id = user.get("sub")
    if not user_id:
        raise HTTPException(status_code=400, detail="Could not identify user from token.")
        
    supabase = get_supabase_admin_client()
    try:
        # This logic is mostly fine, just updating the table schema slightly
        update_data = {
            "wallet_address": request.wallet_address,
            "default_collateral_address": request.default_collateral_address
        }
        response = supabase.from_("profiles").update(update_data).eq("id", user_id).execute()
        
        if not response.data:
            insert_data = {"id": user_id, **update_data}
            supabase.from_("profiles").insert(insert_data).execute()

        return {"message": "Wallet address saved successfully."}
    except Exception as e:
        print(f"ERROR saving wallet address for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail=f"An error occurred while saving the wallet address: {str(e)}")
