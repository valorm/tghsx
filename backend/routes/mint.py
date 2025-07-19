# In /backend/routes/mint.py

import os
import uuid
import httpx
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from pydantic import BaseModel
from decimal import Decimal
from typing import Dict, Any

from services.web3_client import get_web3_provider
from services.supabase_client import get_supabase_admin_client
from utils.utils import load_contract_abi, get_current_user, is_admin_user
from web3 import Web3

router = APIRouter()

# --- Load Contract Details ---
COLLATERAL_VAULT_ADDRESS = os.getenv("COLLATERAL_VAULT_ADDRESS")
if not COLLATERAL_VAULT_ADDRESS:
    raise RuntimeError("COLLATERAL_VAULT_ADDRESS is not set in the environment.")
COLLATERAL_VAULT_ABI = load_contract_abi("abi/CollateralVault.json")

# --- Telegram Configuration ---
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID")

# --- Pydantic Models ---
class MintRequestPayload(BaseModel):
    collateral_address: str
    mint_amount: str

class AdminActionRequest(BaseModel):
    request_id: str

# --- NEW: Model for Auto-Mint ---
class AutoMintRequest(BaseModel):
    collateral_address: str

# --- Telegram Alert Helper Function ---
async def send_telegram_alert(message: str):
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        print("TELEGRAM ALERT SKIPPED: Bot token or chat ID not set.")
        return
    api_url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    payload = {"chat_id": TELEGRAM_CHAT_ID, "text": message, "parse_mode": "Markdown"}
    try:
        async with httpx.AsyncClient() as client:
            await client.post(api_url, json=payload, timeout=10.0)
    except Exception as e:
        print(f"!!! TELEGRAM ALERT FAILED: {e}")

# --- Endpoints ---

# --- NEW: Endpoint for Auto-Minting ---
@router.post("/auto", status_code=status.HTTP_200_OK)
async def trigger_auto_mint(
    payload: AutoMintRequest,
    user: dict = Depends(get_current_user)
):
    """
    Allows a user to trigger the autoMint function.
    This endpoint verifies eligibility and then the user signs the transaction on the frontend.
    """
    user_id = user.get("sub")
    supabase = get_supabase_admin_client()

    profile_res = supabase.from_("profiles").select("wallet_address").eq("id", user_id).single().execute()
    if not profile_res.data or not profile_res.data.get("wallet_address"):
        raise HTTPException(status_code=404, detail="User profile or wallet address not found.")
    
    user_wallet_address = Web3.to_checksum_address(profile_res.data["wallet_address"])
    collateral_addr = Web3.to_checksum_address(payload.collateral_address)

    try:
        w3 = get_web3_provider()
        vault_contract = w3.eth.contract(address=Web3.to_checksum_address(COLLATERAL_VAULT_ADDRESS), abi=COLLATERAL_VAULT_ABI)
        
        # --- Pre-flight checks on the backend ---
        # 1. Check if auto-minting is enabled globally
        is_enabled = vault_contract.functions.autoMintEnabled().call()
        if not is_enabled:
            raise HTTPException(status_code=400, detail="Auto-Minting is currently disabled by the admin.")

        # 2. Check user's cooldown and other limits
        mint_status = vault_contract.functions.getUserMintStatus(user_wallet_address).call()
        cooldown_remaining = mint_status[3]
        if cooldown_remaining > 0:
            raise HTTPException(status_code=400, detail=f"You are in a cooldown period. Please wait {cooldown_remaining} more seconds.")

        # If checks pass, the user can proceed on the frontend.
        # The frontend will call the `autoMint` function directly.
        return {"message": "Auto-mint is eligible. Please proceed with the transaction on your wallet."}

    except HTTPException as http_exc:
        raise http_exc
    except Exception as e:
        # This will catch reverts from the contract calls if any requirements fail
        error_message = str(e)
        if "InsufficientCollateralForAutoMint" in error_message:
            raise HTTPException(status_code=400, detail="Your collateral ratio is too low for Auto-Mint.")
        raise HTTPException(status_code=500, detail=f"An error occurred: {error_message}")


@router.post("/request", status_code=status.HTTP_201_CREATED)
async def submit_mint_request(
    payload: MintRequestPayload,
    background_tasks: BackgroundTasks,
    user: dict = Depends(get_current_user)
):
    # This function remains unchanged
    user_id = user.get("sub")
    supabase = get_supabase_admin_client()

    profile_res = supabase.from_("profiles").select("wallet_address").eq("id", user_id).single().execute()
    if not profile_res.data or not profile_res.data.get("wallet_address"):
        raise HTTPException(status_code=404, detail="User profile or wallet address not found. Please save your wallet address first.")
    
    user_wallet_address = Web3.to_checksum_address(profile_res.data["wallet_address"])
    collateral_addr = Web3.to_checksum_address(payload.collateral_address)
    
    try:
        w3 = get_web3_provider()
        vault_contract = w3.eth.contract(address=Web3.to_checksum_address(COLLATERAL_VAULT_ADDRESS), abi=COLLATERAL_VAULT_ABI)
        
        position = vault_contract.functions.getUserPosition(user_wallet_address, collateral_addr).call()
        collateral_value = position[2] 
        current_minted_amount = position[1]

        mint_amount_decimal = Decimal(payload.mint_amount)
        new_mint_request_amount = int(mint_amount_decimal * (10**6))
        
        total_proposed_debt = current_minted_amount + new_mint_request_amount
        min_collateral_ratio = vault_contract.functions.MIN_COLLATERAL_RATIO().call()
        
        required_collateral_value = (total_proposed_debt * min_collateral_ratio) / (10**6)

        if collateral_value < required_collateral_value:
             raise HTTPException(status_code=400, detail=f"Insufficient deposited collateral. Your collateral value is too low to mint this amount.")

        request_data = {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "collateral_address": payload.collateral_address,
            "mint_amount": payload.mint_amount,
            "status": "pending"
        }
        supabase.table("mint_requests").insert(request_data).execute()
        
        alert_message = (
            f"🚨 *New Mint Request* 🚨\n\n"
            f"*User ID:* `{user_id}`\n"
            f"*Collateral Token:* `{payload.collateral_address}`\n"
            f"*Requested Mint Amount:* `{payload.mint_amount}` tGHSX\n\n"
            f"Please review in the admin dashboard."
        )
        background_tasks.add_task(send_telegram_alert, alert_message)
        
        return {"message": "Mint request submitted successfully for review.", "request_id": request_data["id"]}
    except HTTPException as http_exc:
        raise http_exc
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"An error occurred while validating your request: {str(e)}")

# Other admin endpoints for approve/decline remain unchanged
