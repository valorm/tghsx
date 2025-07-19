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
    # FIX: User must specify which collateral they are using for the mint operation.
    collateral_address: str
    mint_amount: str # The amount of tGHSX the user wants to mint.

class AdminActionRequest(BaseModel):
    request_id: str

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
@router.post("/request", status_code=status.HTTP_201_CREATED)
async def submit_mint_request(
    payload: MintRequestPayload,
    background_tasks: BackgroundTasks,
    user: dict = Depends(get_current_user)
):
    user_id = user.get("sub")
    supabase = get_supabase_admin_client()

    profile_res = supabase.from_("profiles").select("wallet_address").eq("id", user_id).single().execute()
    if not profile_res.data or not profile_res.data.get("wallet_address"):
        raise HTTPException(status_code=404, detail="User profile or wallet address not found. Please save your wallet address first.")
    
    user_wallet_address = Web3.to_checksum_address(profile_res.data["wallet_address"])
    collateral_addr = Web3.to_checksum_address(payload.collateral_address)
    
    # --- ARCHITECTURAL FIX & VALIDATION ---
    # The backend must verify that the user's requested mint amount is valid
    # based on their *already deposited* collateral, BEFORE creating a request.
    try:
        w3 = get_web3_provider()
        vault_contract = w3.eth.contract(address=Web3.to_checksum_address(COLLATERAL_VAULT_ADDRESS), abi=COLLATERAL_VAULT_ABI)
        
        position = vault_contract.functions.getUserPosition(user_wallet_address, collateral_addr).call()
        collateral_value = position[2] # The total value of their deposited collateral in USD (with 6 decimals)
        current_minted_amount = position[1] # Their current debt (with 6 decimals)

        # Convert user's requested mint amount to the contract's precision (6 decimals)
        mint_amount_decimal = Decimal(payload.mint_amount)
        new_mint_request_amount = int(mint_amount_decimal * (10**6))
        
        # Calculate the required collateral value for the *total* debt (new + old)
        total_proposed_debt = current_minted_amount + new_mint_request_amount
        min_collateral_ratio = vault_contract.functions.MIN_COLLATERAL_RATIO().call()
        
        required_collateral_value = (total_proposed_debt * min_collateral_ratio) / (10**6)

        if collateral_value < required_collateral_value:
             raise HTTPException(status_code=400, detail=f"Insufficient deposited collateral. Your collateral value is too low to mint this amount. Please deposit more collateral first.")

        # If validation passes, create the request for admin approval.
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
        raise http_exc # Re-raise validation errors
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"An error occurred while validating your request: {str(e)}")


@router.post("/admin/approve")
async def approve_mint_request(
    payload: AdminActionRequest,
    background_tasks: BackgroundTasks,
    admin: dict = Depends(is_admin_user)
):
    """
    CRITICAL FIX: This endpoint now only approves the request in the database.
    It DOES NOT and MUST NOT send an on-chain transaction. The smart contract requires the user
    to be the msg.sender for minting. The frontend will see the 'approved' status
    and enable the user to execute the final transaction.
    """
    supabase = get_supabase_admin_client()
    admin_id = admin.get("sub")
    
    try:
        req_res = supabase.from_("mint_requests").select("*").eq("id", payload.request_id).eq("status", "pending").single().execute()
        if not req_res.data:
            raise HTTPException(status_code=404, detail="Pending request not found.")
        
        pending_request = req_res.data
        
        # Update the status to 'approved' in the database. This is the only action.
        supabase.from_("mint_requests").update({"status": "approved"}).eq("id", payload.request_id).execute()
        
        alert_message = (
            f"✅ *Mint Request Approved* ✅\n\n"
            f"*Request ID:* `{payload.request_id}`\n"
            f"*User ID:* `{pending_request['user_id']}`\n"
            f"*Amount:* `{pending_request['mint_amount']}` tGHSX\n"
            f"*Approved by Admin:* `{admin_id}`\n\n"
            f"The user can now complete the minting process on the platform."
        )
        background_tasks.add_task(send_telegram_alert, alert_message)

        return {"message": "Mint request approved. User can now proceed with the on-chain transaction."}
        
    except Exception as e:
        supabase.table("mint_requests").update({"status": "failed", "error_message": str(e)}).eq("id", payload.request_id).execute()
        raise HTTPException(status_code=500, detail=f"An error occurred during mint approval: {str(e)}")


@router.post("/admin/decline", response_model=Dict[str, Any])
async def decline_mint_request(
    payload: AdminActionRequest,
    background_tasks: BackgroundTasks,
    admin: dict = Depends(is_admin_user)
):
    # This endpoint's logic is correct. It just updates the database status.
    supabase = get_supabase_admin_client()
    admin_id = admin.get("sub")
    
    try:
        req_res = supabase.table("mint_requests").select("user_id").eq("id", payload.request_id).eq("status", "pending").single().execute()
        if not req_res.data:
            raise HTTPException(status_code=404, detail="Pending mint request not found or already processed.")
        
        user_id = req_res.data['user_id']
        supabase.table("mint_requests").update({"status": "declined"}).eq("id", payload.request_id).execute()
        
        alert_message = (
            f"❌ *Mint Request Declined* ❌\n\n"
            f"*Request ID:* `{payload.request_id}`\n"
            f"*User ID:* `{user_id}`\n"
            f"*Declined by Admin:* `{admin_id}`"
        )
        background_tasks.add_task(send_telegram_alert, alert_message)
        
        return {"message": "Request declined successfully.", "declined_request_id": payload.request_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to decline request: {str(e)}")
