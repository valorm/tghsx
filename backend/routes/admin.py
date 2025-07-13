# In /backend/routes/mint.py

import os
import uuid
import httpx
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from pydantic import BaseModel, Field
from decimal import Decimal
from typing import Dict, Any, List

from services.web3_client import get_web3_provider
from services.supabase_client import get_supabase_admin_client
from services.oracle_service import get_eth_ghs_price
from utils.utils import load_contract_abi, get_current_user, is_admin_user
from web3 import Web3
from web3.middleware import geth_poa_middleware

router = APIRouter()

# --- Load Contract Details and Admin Key ---
COLLATERAL_VAULT_ADDRESS = os.getenv("COLLATERAL_VAULT_ADDRESS")
MINTER_PRIVATE_KEY = os.getenv("MINTER_PRIVATE_KEY")
if not COLLATERAL_VAULT_ADDRESS or not MINTER_PRIVATE_KEY:
    raise RuntimeError("Contract address or minter key not set in environment.")

COLLATERAL_VAULT_ABI = load_contract_abi("abi/CollateralVault.json")

# --- Telegram Configuration ---
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID")


# --- Pydantic Models ---
class MintRequestPayload(BaseModel):
    eth_collateral: str
    tghsx_to_mint: str

class AdminActionRequest(BaseModel):
    request_id: str

class MintRequestResponse(BaseModel):
    id: str
    user_id: str
    collateral_amount: str
    mint_amount: str
    collateral_ratio: float
    status: str

class MintStatusResponse(BaseModel):
    status: str

# --- Telegram Alert Helper Function ---
async def send_telegram_alert(message: str):
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        print("TELEGRAM ALERT SKIPPED: Bot token or chat ID not set.")
        return

    api_url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    payload = {
        "chat_id": TELEGRAM_CHAT_ID,
        "text": message,
        "parse_mode": "Markdown"
    }
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(api_url, json=payload, timeout=10.0)
            response.raise_for_status()
            print(">>> Telegram alert sent successfully!")
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
    if not user_id:
        raise HTTPException(status_code=400, detail="Could not identify user from token.")

    supabase = get_supabase_admin_client()
    eth_price_data = get_eth_ghs_price()
    eth_price_ghs = Decimal(str(eth_price_data['eth_ghs_price'])) / Decimal(10**eth_price_data['decimals'])
    
    try:
        collateral_value_ghs = Decimal(payload.eth_collateral) * eth_price_ghs
        ratio = (collateral_value_ghs / Decimal(payload.tghsx_to_mint)) * 100
        
        request_data = {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "collateral_amount": payload.eth_collateral,
            "mint_amount": payload.tghsx_to_mint,
            "collateral_ratio": float(ratio),
            "status": "pending"
        }
        response = supabase.table("mint_requests").insert(request_data).execute()
        
        alert_message = (
            f"🚨 *New Mint Request Submitted* 🚨\n\n"
            f"*User ID:* `{user_id}`\n"
            f"*Collateral:* `{payload.eth_collateral}` ETH\n"
            f"*Mint Amount:* `{payload.tghsx_to_mint}` tGHSX\n"
            f"*Collateral Ratio:* `{ratio:.2f}%`\n\n"
            f"Please review in the admin dashboard."
        )
        background_tasks.add_task(send_telegram_alert, alert_message)
        
        return {"message": "Mint request submitted successfully.", "request_id": response.data[0]["id"]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"An error occurred: {str(e)}")


@router.get("/request/{request_id}", response_model=MintStatusResponse)
async def get_mint_request_status(
    request_id: str,
    user: dict = Depends(get_current_user),
    supabase = Depends(get_supabase_admin_client)
):
    user_id = user.get("sub")
    try:
        response = (
            supabase.table("mint_requests")
            .select("status")
            .eq("id", request_id)
            .eq("user_id", user_id)
            .single()
            .execute()
        )

        if not response.data:
            raise HTTPException(status_code=404, detail="Mint request not found or you do not have permission to view it.")

        return MintStatusResponse(status=response.data.get("status"))
    except Exception as e:
        if "JSON object requested, multiple (or no) rows returned" in str(e):
             raise HTTPException(status_code=404, detail="Mint request not found.")
        raise HTTPException(status_code=500, detail=f"Failed to fetch request status: {str(e)}")


@router.get("/admin/pending-requests", response_model=List[MintRequestResponse])
async def get_pending_requests(admin: dict = Depends(is_admin_user)):
    supabase = get_supabase_admin_client()
    try:
        response = supabase.table("mint_requests").select("*").eq("status", "pending").execute()
        return response.data if response.data else []
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch pending requests: {str(e)}")


@router.post("/admin/mint")
async def approve_and_mint(
    payload: AdminActionRequest, 
    background_tasks: BackgroundTasks,
    admin: dict = Depends(is_admin_user)
):
    # FIX: The new contract does not support a direct admin minting function.
    # This endpoint is now deprecated and returns a 'Not Implemented' error.
    # The admin-gated minting flow would need to be redesigned if this feature is required.
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Admin-gated minting is not supported by the current smart contract version. Users must mint directly."
    )


@router.post("/admin/decline", response_model=Dict[str, Any])
async def decline_mint_request(
    payload: AdminActionRequest, 
    background_tasks: BackgroundTasks,
    admin: dict = Depends(is_admin_user)
):
    supabase = get_supabase_admin_client()
    admin_id = admin.get("sub")
    
    try:
        req_res = supabase.table("mint_requests").select("user_id").eq("id", payload.request_id).eq("status", "pending").single().execute()
        if not req_res.data:
            raise HTTPException(status_code=404, detail="Pending mint request not found or already processed.")
        
        user_id = req_res.data['user_id']

        (supabase.table("mint_requests").update({"status": "declined"}).eq("id", payload.request_id).execute())
        
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
