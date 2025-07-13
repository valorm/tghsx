
import os
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, validator
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
# These addresses cannot be linked to user accounts.
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

    @validator('wallet_address')
    def wallet_address_must_be_valid_checksum(cls, v):
        """
        Validates that the provided wallet address is a valid, checksummed Ethereum address.
        This check is performed automatically by Pydantic on incoming requests.
        """
        if not Web3.is_address(v):
            raise ValueError('Invalid wallet address format.')
        if not Web3.is_checksum_address(v):
            raise ValueError('Wallet address is not checksummed. Please provide a checksummed address.')
        return v

# --- Vault Endpoints ---
@router.get("/status", response_model=Dict[str, Any])
async def get_onchain_vault_status(
    user: dict = Depends(get_current_user),
    supabase = Depends(get_supabase_admin_client)
):
    """
    Fetches the real-time status of a user's vault directly from the smart contract.

    This endpoint retrieves the user's linked wallet address from their profile,
    then calls the `getUserPosition` view function on the CollateralVault contract
    to get the most up-to-date information.

    Args:
        user (dict): The authenticated user object, injected by FastAPI's dependency system.
        supabase: The Supabase admin client instance.

    Returns:
        A dictionary containing the user's vault status, including collateral,
        debt, collateralization ratio, and liquidation status.
        Returns a zeroed-out status if the user has no wallet linked.
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

    This endpoint performs several critical checks:
    1.  Verifies the address is not a blacklisted system address.
    2.  Checks if the user is simply reconnecting an already-linked wallet.
    3.  Handles cases where the wallet is already linked to another user.
    4.  Updates the `wallet_last_linked_at` timestamp for audit purposes.

    Args:
        request (SaveWalletRequest): The request body containing the wallet address.
        user (dict): The authenticated user object.

    Returns:
        A success message upon successfully linking the wallet.

    Raises:
        HTTPException 403: If the address is a blacklisted system address.
        HTTPException 409: If the wallet address is already linked to another user.
        HTTPException 500: For any other database or unexpected errors.
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
        # Step 4: Handle specific database errors, like unique constraint violations.
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
