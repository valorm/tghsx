# In /backend/routes/mint.py

import os
import uuid
import httpx
import time
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from pydantic import BaseModel, validator
from decimal import Decimal
from typing import Dict, Any, List

from services.web3_client import get_web3_provider
from services.supabase_client import get_supabase_admin_client
from utils.utils import load_contract_abi, get_current_user, is_admin_user
from services.web3_service import send_admin_transaction
from web3 import Web3

# FIX: Removed the redundant prefix="/mint" from the router definition.
router = APIRouter(tags=["Minting"])

# --- Load Contract Details ---
COLLATERAL_VAULT_ADDRESS = os.getenv("COLLATERAL_VAULT_ADDRESS")
if not COLLATERAL_VAULT_ADDRESS:
    raise RuntimeError("COLLATERAL_VAULT_ADDRESS is not set in the environment.")
COLLATERAL_VAULT_ABI = load_contract_abi("abi/CollateralVault.json")
PRECISION = 10**6
MAX_SINGLE_MINT = 1000 * PRECISION

# --- Telegram Configuration ---
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID")

# --- Pydantic Models ---
class MintRequestPayload(BaseModel):
    collateral_address: str
    mint_amount: float

    @validator('mint_amount')
    def validate_mint_amount(cls, v):
        if v <= 0:
            raise ValueError("Mint amount must be greater than zero")
        if v * PRECISION > MAX_SINGLE_MINT:
            raise ValueError(f"Mint amount exceeds maximum single mint limit of {MAX_SINGLE_MINT / PRECISION}")
        return v

class AdminActionRequest(BaseModel):
    request_id: str

class AutoMintRequest(BaseModel):
    collateral_address: str

# --- Helper Functions ---
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

async def check_price_validity(vault_contract, collateral_addr: str):
    """Checks if the collateral price is recent enough."""
    config = vault_contract.functions.collateralConfigs(collateral_addr).call()
    last_update = config[2]  # lastPriceUpdate timestamp (uint64)
    current_time = int(time.time())
    if current_time - last_update > 3600:  # 1 hour staleness check
        raise HTTPException(status_code=400, detail="Price data is stale. Please wait for the oracle to update.")

# --- Endpoints ---

@router.post("/auto", status_code=status.HTTP_200_OK)
async def trigger_auto_mint(
    payload: AutoMintRequest,
    user: dict = Depends(get_current_user)
):
    """
    Allows a user to trigger the autoMint function.
    This endpoint verifies eligibility before the user signs the transaction.
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
        
        await check_price_validity(vault_contract, collateral_addr)
        
        is_enabled = vault_contract.functions.autoMintEnabled().call()
        if not is_enabled:
            raise HTTPException(status_code=400, detail="Auto-Minting is currently disabled by the admin.")

        mint_status = vault_contract.functions.getUserMintStatus(user_wallet_address).call()
        cooldown_remaining = mint_status[3]
        if cooldown_remaining > 0:
            raise HTTPException(status_code=400, detail=f"You are in a cooldown period. Please wait {cooldown_remaining} more seconds.")

        return {"message": "Auto-mint is eligible. Please proceed with the transaction on your wallet."}
    except HTTPException as http_exc:
        raise http_exc
    except Exception as e:
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
        
        await check_price_validity(vault_contract, collateral_addr)
        
        position = vault_contract.functions.getUserPosition(user_wallet_address, collateral_addr).call()
        collateral_value = position[2] 
        current_minted_amount = position[1]

        new_mint_request_amount = int(payload.mint_amount * PRECISION)
        
        total_proposed_debt = current_minted_amount + new_mint_request_amount
        min_collateral_ratio = vault_contract.functions.MIN_COLLATERAL_RATIO().call()
        
        required_collateral_value = (total_proposed_debt * min_collateral_ratio) / PRECISION

        if collateral_value < required_collateral_value:
             raise HTTPException(status_code=400, detail="Insufficient deposited collateral to mint this amount.")

        request_data = {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "collateral_address": payload.collateral_address,
            "mint_amount": str(payload.mint_amount),
            "status": "pending"
        }
        supabase.table("mint_requests").insert(request_data).execute()
        
        alert_message = (f"🚨 *New Mint Request* 🚨\n\n*User ID:* `{user_id}`\n*Collateral:* `{payload.collateral_address}`\n*Amount:* `{payload.mint_amount}` tGHSX")
        background_tasks.add_task(send_telegram_alert, alert_message)
        
        return {"message": "Mint request submitted for review.", "request_id": request_data["id"]}
    except HTTPException as http_exc:
        raise http_exc
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error validating request: {str(e)}")

@router.get("/requests", response_model=List[Dict[str, Any]])
async def get_user_mint_requests(user: dict = Depends(get_current_user)):
    """Fetches pending mint requests for the authenticated user."""
    try:
        user_id = user.get("sub")
        supabase = get_supabase_admin_client()
        response = supabase.table("mint_requests").select("*").eq("user_id", user_id).order("created_at", desc=True).limit(10).execute()
        return response.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch mint requests: {str(e)}")

# --- Admin-only Endpoints for Mint Requests ---
@router.post("/admin/approve", response_model=Dict[str, str], dependencies=[Depends(is_admin_user)])
async def approve_mint(request: AdminActionRequest):
    """Approves a pending mint request. This is an off-chain action."""
    try:
        supabase = get_supabase_admin_client()
        supabase.table("mint_requests").update({"status": "approved"}).eq("id", request.request_id).execute()
        return {"message": f"Mint request {request.request_id} approved."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to approve mint: {str(e)}")

@router.post("/admin/decline", response_model=Dict[str, str], dependencies=[Depends(is_admin_user)])
async def decline_mint(request: AdminActionRequest):
    """Declines a pending mint request."""
    try:
        supabase = get_supabase_admin_client()
        supabase.table("mint_requests").update({"status": "declined"}).eq("id", request.request_id).execute()
        return {"message": f"Mint request {request.request_id} declined."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to decline mint: {str(e)}")
