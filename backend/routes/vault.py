
import os
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, field_validator
from typing import Dict, Any, Set
from web3 import Web3
from postgrest.exceptions import APIError
from datetime import datetime, timezone

# Corrected Import Paths
from services.web3_client import get_web3_provider
from services.supabase_client import get_supabase_admin_client
from utils.utils import get_current_user, load_contract_abi

# --- Router and Environment Setup ---
router = APIRouter()
COLLATERAL_VAULT_ADDRESS = os.getenv("COLLATERAL_VAULT_ADDRESS")
COLLATERAL_VAULT_ABI = load_contract_abi("abi/CollateralVault.json")

# --- Blacklist of system addresses ---
BLACKLISTED_ADDRESSES: Set[str] = {
    addr.lower() for addr in [
        os.getenv("COLLATERAL_VAULT_ADDRESS"),
        os.getenv("TGHSX_TOKEN_ADDRESS"),
        os.getenv("MINTER_ACCOUNT_ADDRESS"),
        os.getenv("CHAINLINK_ETH_USD_PRICE_FEED_ADDRESS"),
        os.getenv("CHAINLINK_BTC_USD_PRICE_FEED_ADDRESS")
    ] if addr is not None
}


# --- Pydantic Models ---
class SaveWalletRequest(BaseModel):
    wallet_address: str

    # FIX: Updated from the deprecated '@validator' to the new '@field_validator'
    # This aligns the code with Pydantic V2 standards and resolves the warning.
    @field_validator('wallet_address')
    @classmethod
    def wallet_address_must_be_valid_and_checksummed(cls, v: str) -> str:
        """
        Validates that the provided wallet address has a valid format,
        and then converts it to its checksummed version.
        """
        if not Web3.is_address(v):
            raise ValueError('Invalid wallet address format.')
        
        return Web3.to_checksum_address(v)

# --- Vault Endpoints ---
@router.get("/status", response_model=Dict[str, Any])
async def get_onchain_vault_status(
    user: dict = Depends(get_current_user),
    supabase = Depends(get_supabase_admin_client)
):
    """
    Fetches the real-time status of a user's vault directly from the smart contract.
    """
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
    """
    Links a user's wallet address to their profile in the database.
    """
    user_id = user.get("sub")
    if not user_id:
        raise HTTPException(status_code=400, detail="Could not identify user from token.")
        
    supabase = get_supabase_admin_client()
    
    try:
        # Step 1: Check against the system address blacklist.
        if request.wallet_address.lower() in BLACKLISTED_ADDRESSES:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This is a system address and cannot be linked to an account."
            )

        # Step 2: Check if the user is just reconnecting the same wallet.
        profile_res = supabase.from_("profiles").select("wallet_address").eq("id", user_id).single().execute()
        if profile_res.data and profile_res.data.get("wallet_address") == request.wallet_address:
            return {"message": "Wallet is already linked to this account.", "status": "reconnected"}

        # Step 3: Prepare data and perform the upsert operation.
        current_timestamp = datetime.now(timezone.utc).isoformat()
        upsert_data = {
            'id': user_id, 
            'wallet_address': request.wallet_address,
            'wallet_last_linked_at': current_timestamp
        }
        response = supabase.from_("profiles").upsert(upsert_data).execute()

        if not response.data:
             raise HTTPException(status_code=500, detail="Failed to save or update wallet address.")

        return {"message": "Wallet address saved successfully."}
    
    except APIError as e:
        # Step 4: Handle specific database errors.
        if e.code == "23505" and 'profiles_wallet_address_key' in e.message:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This wallet address is already linked to another account."
            )
        
        print(f"ERROR saving wallet address for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail=f"A database error occurred: {e.message}")
        
    except Exception as e:
        # Step 5: Catch any other unexpected errors.
        print(f"UNEXPECTED ERROR saving wallet address for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {str(e)}")
