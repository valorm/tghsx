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
# FIX: Import PoA middleware
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
    """
    Sends a message to a specified Telegram chat using the bot token.
    """
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
    supabase = get_supabase_admin_client()
    admin_id = admin.get("sub")
    
    try:
        req_res = supabase.from_("mint_requests").select("*, profiles(wallet_address)").eq("id", payload.request_id).eq("status", "pending").single().execute()
        if not req_res.data: raise HTTPException(status_code=404, detail="Pending request not found.")
        
        pending_request = req_res.data
        user_profile = pending_request.get("profiles")
        if not user_profile or not user_profile.get("wallet_address"): raise HTTPException(status_code=404, detail="User wallet address not found.")
        
        recipient_address = user_profile["wallet_address"]
        amount_to_mint = Decimal(pending_request['mint_amount'])
        amount_wei = int(amount_to_mint * (10**18))

        w3 = get_web3_provider()
        # FIX: Inject PoA middleware to handle PoA chain specifics
        w3.middleware_onion.inject(geth_poa_middleware, layer=0)
        
        vault_contract = w3.eth.contract(address=Web3.to_checksum_address(COLLATERAL_VAULT_ADDRESS), abi=COLLATERAL_VAULT_ABI)
        admin_account = w3.eth.account.from_key(MINTER_PRIVATE_KEY)
        tx_payload = {'from': admin_account.address, 'nonce': w3.eth.get_transaction_count(admin_account.address)}
        
        tx = vault_contract.functions.adminMintForUser(Web3.to_checksum_address(recipient_address), amount_wei).build_transaction(tx_payload)
        signed_tx = w3.eth.account.sign_transaction(tx, private_key=MINTER_PRIVATE_KEY)
        tx_hash = w3.eth.send_raw_transaction(signed_tx.rawTransaction)
        tx_receipt = w3.eth.wait_for_transaction_receipt(tx_hash)
        
        if tx_receipt['status'] == 0: raise Exception("On-chain transaction failed.")
        
        supabase.from_("mint_requests").update({"status": "approved", "tx_hash": tx_hash.hex()}).eq("id", payload.request_id).execute()
        
        alert_message = (
            f"✅ *Mint Request Approved* ✅\n\n"
            f"*Request ID:* `{payload.request_id}`\n"
            f"*User ID:* `{pending_request['user_id']}`\n"
            f"*Amount:* `{amount_to_mint}` tGHSX\n"
            f"*Approved by Admin:* `{admin_id}`\n"
            f"*Tx Hash:* `{tx_hash.hex()}`"
        )
        background_tasks.add_task(send_telegram_alert, alert_message)

        return {"message": "Minting successful.", "transaction_hash": tx_hash.hex()}
        
    except Exception as e:
        failure_message = (
            f"🛑 *Mint Approval Failed* 🛑\n\n"
            f"*Request ID:* `{payload.request_id}`\n"
            f"*Reason:* {str(e)}"
        )
        background_tasks.add_task(send_telegram_alert, failure_message)
        
        supabase.table("mint_requests").update({"status": "failed", "error_message": str(e)}).eq("id", payload.request_id).execute()
        raise HTTPException(status_code=500, detail=f"An error occurred during mint approval: {str(e)}")


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
