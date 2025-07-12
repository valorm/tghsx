# In /backend/routes/vault.py

import os
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import Dict, Any
from web3 import Web3
from decimal import Decimal

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

class MintRequest(BaseModel):
    collateral_amount: str
    mint_amount: str

# --- Helper Functions ---
def get_vault_contract():
    """Get the vault contract instance"""
    w3 = get_web3_provider()
    return w3.eth.contract(
        address=Web3.to_checksum_address(COLLATERAL_VAULT_ADDRESS), 
        abi=COLLATERAL_VAULT_ABI
    )

def format_vault_data(position_data):
    """Format raw contract data into a consistent structure"""
    return {
        "ethCollateral": str(position_data[0]),
        "tghsxMinted": str(position_data[1]),
        "collateralizationRatio": str(position_data[2]),
        "isLiquidatable": position_data[3] if len(position_data) > 3 else False,
        "accruedFees": str(position_data[4]) if len(position_data) > 4 else "0"
    }

# --- Vault Endpoints ---
@router.get("/status", response_model=Dict[str, Any])
async def get_onchain_vault_status(
    user: dict = Depends(get_current_user),
    supabase = Depends(get_supabase_admin_client)
):
    """Get user's vault status from on-chain data"""
    user_id = user.get("sub")
    
    try:
        # Get user's wallet address from profile
        user_res = supabase.from_("profiles").select("wallet_address").eq("id", user_id).single().execute()

        if not user_res.data or not user_res.data.get("wallet_address"):
            # User hasn't connected wallet yet
            return {
                "ethCollateral": "0",
                "tghsxMinted": "0",
                "collateralizationRatio": "0",
                "isLiquidatable": False,
                "accruedFees": "0",
                "hasWallet": False
            }
        
        wallet_address = Web3.to_checksum_address(user_res.data["wallet_address"])
        vault_contract = get_vault_contract()
        
        # Call the contract function
        position_data = vault_contract.functions.getUserPosition(wallet_address).call()
        
        result = format_vault_data(position_data)
        result["hasWallet"] = True
        result["walletAddress"] = wallet_address
        
        return result
        
    except Exception as e:
        # Handle the case where user doesn't have a vault position
        if "execution reverted" in str(e).lower() or "call exception" in str(e).lower():
            return {
                "ethCollateral": "0",
                "tghsxMinted": "0",
                "collateralizationRatio": "0",
                "isLiquidatable": False,
                "accruedFees": "0",
                "hasWallet": True,
                "walletAddress": user_res.data.get("wallet_address", "") if user_res.data else ""
            }
        
        raise HTTPException(
            status_code=500, 
            detail=f"Failed to retrieve vault status: {str(e)}"
        )

@router.post("/save-wallet-address")
async def save_wallet_address(
    request: SaveWalletRequest,
    user: dict = Depends(get_current_user)
):
    """Save user's wallet address to profile"""
    user_id = user.get("sub")
    if not user_id:
        raise HTTPException(status_code=400, detail="Could not identify user from token.")
    
    # Validate wallet address format
    if not request.wallet_address.startswith('0x') or len(request.wallet_address) != 42:
        raise HTTPException(status_code=400, detail="Invalid wallet address format.")
    
    try:
        # Convert to checksum address
        checksum_address = Web3.to_checksum_address(request.wallet_address)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid wallet address.")
        
    supabase = get_supabase_admin_client()
    
    try:
        # Check if wallet is already used by another user
        existing_wallet = supabase.from_("profiles").select("id").eq("wallet_address", checksum_address).execute()
        if existing_wallet.data and existing_wallet.data[0]["id"] != user_id:
            raise HTTPException(status_code=400, detail="Wallet address already associated with another account.")
        
        # Update or create profile
        response = supabase.from_("profiles").update({
            "wallet_address": checksum_address
        }).eq("id", user_id).execute()
        
        if not response.data:
            # Profile doesn't exist, create it
            insert_res = supabase.from_("profiles").insert({
                "id": user_id, 
                "wallet_address": checksum_address
            }).execute()
            
            if not insert_res.data:
                raise HTTPException(status_code=500, detail="Failed to save wallet address.")

        return {"message": "Wallet address saved successfully.", "wallet_address": checksum_address}
        
    except Exception as e:
        print(f"ERROR saving wallet address for user {user_id}: {e}")
        raise HTTPException(
            status_code=500, 
            detail=f"An error occurred while saving the wallet address: {str(e)}"
        )

@router.post("/mint-request")
async def create_mint_request(
    request: MintRequest,
    user: dict = Depends(get_current_user),
    supabase = Depends(get_supabase_admin_client)
):
    """Create a new mint request"""
    user_id = user.get("sub")
    
    try:
        # Get user's wallet address
        user_res = supabase.from_("profiles").select("wallet_address").eq("id", user_id).single().execute()
        
        if not user_res.data or not user_res.data.get("wallet_address"):
            raise HTTPException(status_code=400, detail="Please connect your wallet first.")
        
        wallet_address = user_res.data["wallet_address"]
        
        # Get current vault status to calculate collateral ratio
        vault_contract = get_vault_contract()
        
        try:
            position_data = vault_contract.functions.getUserPosition(Web3.to_checksum_address(wallet_address)).call()
            current_collateral = Decimal(str(position_data[0]))
            current_debt = Decimal(str(position_data[1]))
        except:
            # User doesn't have a vault position yet
            current_collateral = Decimal('0')
            current_debt = Decimal('0')
        
        # Calculate new amounts
        new_collateral = current_collateral + Decimal(request.collateral_amount)
        new_debt = current_debt + Decimal(request.mint_amount)
        
        # Calculate collateral ratio (simplified - you may want to use price oracle)
        collateral_ratio = float(new_collateral / new_debt * 100) if new_debt > 0 else float('inf')
        
        # Create mint request record
        mint_request = supabase.from_("mint_requests").insert({
            "user_id": user_id,
            "collateral_amount": request.collateral_amount,
            "mint_amount": request.mint_amount,
            "collateral_ratio": collateral_ratio,
            "status": "pending"
        }).execute()
        
        if not mint_request.data:
            raise HTTPException(status_code=500, detail="Failed to create mint request.")
        
        return {
            "message": "Mint request created successfully.",
            "request_id": mint_request.data[0]["id"],
            "collateral_ratio": collateral_ratio
        }
        
    except Exception as e:
        print(f"ERROR creating mint request for user {user_id}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"An error occurred while creating mint request: {str(e)}"
        )

@router.get("/mint-requests")
async def get_user_mint_requests(
    user: dict = Depends(get_current_user),
    supabase = Depends(get_supabase_admin_client)
):
    """Get user's mint requests"""
    user_id = user.get("sub")
    
    try:
        requests = supabase.from_("mint_requests").select("*").eq("user_id", user_id).order("created_at", desc=True).execute()
        
        return {"requests": requests.data}
        
    except Exception as e:
        print(f"ERROR fetching mint requests for user {user_id}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"An error occurred while fetching mint requests: {str(e)}"
        )