# In /backend/routes/mint.py

import os
import uuid
import httpx
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from pydantic import BaseModel
from decimal import Decimal
from typing import Dict, Any, List

from services.web3_client import get_web3_provider
from services.supabase_client import get_supabase_admin_client
from services.oracle_service import get_eth_ghs_price # Assuming this service exists and works
from utils.utils import load_contract_abi, get_current_user, is_admin_user
from web3 import Web3

router = APIRouter()

# --- Load Contract Details ---
COLLATERAL_VAULT_ADDRESS = os.getenv("COLLATERAL_VAULT_ADDRESS")
COLLATERAL_VAULT_ABI = load_contract_abi("abi/CollateralVault.json")

# --- Telegram Configuration ---
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID")


# --- Pydantic Models ---
class MintRequestPayload(BaseModel):
    # FIX: User must specify which collateral they are using
    collateral_address: str
    collateral_amount: str
    mint_amount: str

class AdminActionRequest(BaseModel):
    request_id: str

class MintRequestResponse(BaseModel):
    id: str
    user_id: str
    collateral_address: str
    collateral_amount: str
    mint_amount: str
    status: str

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

    # Get user's wallet address from their profile
    profile_res = supabase.from_("profiles").select("wallet_address").eq("id", user_id).single().execute()
    if not profile_res.data or not profile_res.data.get("wallet_address"):
        raise HTTPException(status_code=404, detail="User profile or wallet address not found. Please save your wallet address.")
    
    user_wallet_address = profile_res.data["wallet_address"]

    # --- ARCHITECTURAL FIX ---
    # The contract requires collateral to be deposited BEFORE minting.
    # This endpoint will now verify the user has sufficient deposited collateral.
    try:
        w3 = get_web3_provider()
        vault_contract = w3.eth.contract(address=Web3.to_checksum_address(COLLATERAL_VAULT_ADDRESS), abi=COLLATERAL_VAULT_ABI)
        
        position = vault_contract.functions.getUserPosition(
            Web3.to_checksum_address(user_wallet_address),
            Web3.to_checksum_address(payload.collateral_address)
        ).call()
        
        deposited_collateral = position[0]
        
        # Check if the user has deposited enough collateral to even make this request
        if deposited_collateral < int(Decimal(payload.collateral_amount) * (10**18)): # Assuming 18 decimals for collateral
             raise HTTPException(status_code=400, detail="Insufficient deposited collateral to fulfill this mint request. Please deposit more collateral first.")

        request_data = {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "collateral_address": payload.collateral_address,
            "collateral_amount": payload.collateral_amount,
            "mint_amount": payload.mint_amount,
            "status": "pending"
        }
        supabase.table("mint_requests").insert(request_data).execute()
        
        alert_message = (
            f"🚨 *New Mint Request* 🚨\n\n"
            f"*User ID:* `{user_id}`\n"
            f"*Collateral:* `{payload.collateral_amount}` of token `{payload.collateral_address}`\n"
            f"*Mint Amount:* `{payload.mint_amount}` tGHSX\n\n"
            f"Please review in the admin dashboard."
        )
        background_tasks.add_task(send_telegram_alert, alert_message)
        
        return {"message": "Mint request submitted successfully for review.", "request_id": request_data["id"]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"An error occurred: {str(e)}")


@router.post("/admin/approve")
async def approve_mint_request(
    payload: AdminActionRequest,
    background_tasks: BackgroundTasks,
    admin: dict = Depends(is_admin_user)
):
    """
    CRITICAL CHANGE: This endpoint now only approves the request in the database.
    It DOES NOT send an on-chain transaction. The smart contract requires the user
    to be the msg.sender for minting, so the final step must be initiated by the user
    on the frontend after receiving this approval.
    """
    supabase = get_supabase_admin_client()
    admin_id = admin.get("sub")
    
    try:
        # Check for the pending request
        req_res = supabase.from_("mint_requests").select("*").eq("id", payload.request_id).eq("status", "pending").single().execute()
        if not req_res.data:
            raise HTTPException(status_code=404, detail="Pending request not found.")
        
        pending_request = req_res.data
        
        # Update the status to 'approved'
        supabase.from_("mint_requests").update({"status": "approved"}).eq("id", payload.request_id).execute()
        
        # Notify admin and implicitly the user
        alert_message = (
            f"✅ *Mint Request Approved* ✅\n\n"
            f"*Request ID:* `{payload.request_id}`\n"
            f"*User ID:* `{pending_request['user_id']}`\n"
            f"*Amount:* `{pending_request['mint_amount']}` tGHSX\n"
            f"*Approved by Admin:* `{admin_id}`\n\n"
            f"User has been notified to complete the minting process on the platform."
        )
        background_tasks.add_task(send_telegram_alert, alert_message)

        return {"message": "Mint request approved. User can now proceed with the on-chain transaction."}
        
    except Exception as e:
        # If something fails, mark the request as failed in the DB
        supabase.table("mint_requests").update({"status": "failed", "error_message": str(e)}).eq("id", payload.request_id).execute()
        raise HTTPException(status_code=500, detail=f"An error occurred during mint approval: {str(e)}")


@router.post("/admin/decline", response_model=Dict[str, Any])
async def decline_mint_request(
    payload: AdminActionRequest,
    background_tasks: BackgroundTasks,
    admin: dict = Depends(is_admin_user)
):
    # This endpoint's logic remains largely the same and is correct.
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
