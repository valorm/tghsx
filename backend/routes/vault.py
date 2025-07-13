# In /backend/routes/vault.py

import os
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import Dict, Any
from web3 import Web3
from postgrest.exceptions import APIError

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

# --- Vault Endpoints ---
@router.get("/status", response_model=Dict[str, Any])
async def get_onchain_vault_status(
    user: dict = Depends(get_current_user),
    supabase = Depends(get_supabase_admin_client)
):
    user_id = user.get("sub")
    try:
        user_res = supabase.from_("profiles").select("wallet_address").eq("id", user_id).single().execute()

        if not user_res.data or not user_res.data.get("wallet_address"):
            return {"ethCollateral": "0", "tghsxMinted": "0", "collateralizationRatio": "0", "isLiquidatable": False, "accruedFees": "0"}
        
        w3 = get_web3_provider()
        vault_contract = w3.eth.contract(address=Web3.to_checksum_address(COLLATERAL_VAULT_ADDRESS), abi=COLLATERAL_VAULT_ABI)
        position_data = vault_contract.functions.getUserPosition(Web3.to_checksum_address(user_res.data["wallet_address"])).call()

        return {
            "ethCollateral": str(position_data[0]),
            "tghsxMinted": str(position_data[1]),
            "collateralizationRatio": str(position_data[2]),
            "isLiquidatable": position_data[3],
            "accruedFees": str(position_data[4])
        }
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
        # Use upsert to either create a new profile or update an existing one.
        # This is more robust than separate insert/update calls.
        upsert_data = {'id': user_id, 'wallet_address': request.wallet_address}
        response = supabase.from_("profiles").upsert(upsert_data).execute()

        if not response.data:
             raise HTTPException(status_code=500, detail="Failed to save or update wallet address.")

        return {"message": "Wallet address saved successfully."}
    
    except APIError as e:
        # FIX: Gracefully handle the specific "duplicate key" error from the database.
        # The database correctly enforces that a wallet can only be linked to one user.
        # This code now catches that specific error and returns a user-friendly message.
        if e.code == "23505": # PostgreSQL code for unique_violation
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This wallet address is already linked to another account."
            )
        # For any other database errors, raise a generic 500 error.
        print(f"ERROR saving wallet address for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail=f"A database error occurred: {e.message}")
        
    except Exception as e:
        # Catch any other unexpected errors.
        print(f"UNEXPECTED ERROR saving wallet address for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {str(e)}")

