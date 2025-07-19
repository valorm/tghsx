# In /backend/routes/vault.py

import os
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import Dict, Any
from web3 import Web3
from decimal import Decimal

from services.web3_client import get_web3_provider
from services.supabase_client import get_supabase_admin_client
from utils.utils import get_current_user, load_contract_abi

# --- Router and Environment Setup ---
router = APIRouter()
COLLATERAL_VAULT_ADDRESS = os.getenv("COLLATERAL_VAULT_ADDRESS")
if not COLLATERAL_VAULT_ADDRESS:
    raise RuntimeError("COLLATERAL_VAULT_ADDRESS is not set in the environment.")
COLLATERAL_VAULT_ABI = load_contract_abi("abi/CollateralVault.json")

# --- Pydantic Models ---
class SaveWalletRequest(BaseModel):
    wallet_address: str
    default_collateral_address: str 

class VaultStatusResponse(BaseModel):
    collateralAmount: str
    mintedAmount: str
    collateralValueUSD: str
    collateralRatio: str
    isLiquidatable: bool
    lastUpdateTime: int

# --- NEW: Model for mint status response ---
class MintStatusResponse(BaseModel):
    dailyMinted: str
    remainingDaily: str
    lastMintTime: int
    cooldownRemaining: int
    dailyMintCount: int
    remainingMints: int

# --- Vault Endpoints ---

# --- NEW: Endpoint to get user's minting status and cooldown ---
@router.get("/mint-status", response_model=MintStatusResponse)
async def get_user_mint_status(
    user: dict = Depends(get_current_user),
    supabase = Depends(get_supabase_admin_client)
):
    user_id = user.get("sub")
    try:
        user_res = supabase.from_("profiles").select("wallet_address").eq("id", user_id).single().execute()
        if not user_res.data or not user_res.data.get("wallet_address"):
            raise HTTPException(status_code=404, detail="User wallet address not found.")
        
        user_wallet = Web3.to_checksum_address(user_res.data["wallet_address"])

        w3 = get_web3_provider()
        vault_contract = w3.eth.contract(address=Web3.to_checksum_address(COLLATERAL_VAULT_ADDRESS), abi=COLLATERAL_VAULT_ABI)
        
        status_data = vault_contract.functions.getUserMintStatus(user_wallet).call()
        
        return MintStatusResponse(
            dailyMinted=str(status_data[0]),
            remainingDaily=str(status_data[1]),
            lastMintTime=status_data[2],
            cooldownRemaining=status_data[3],
            dailyMintCount=status_data[4],
            remainingMints=status_data[5]
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve mint status: {str(e)}")


@router.get("/status/{collateral_address}", response_model=VaultStatusResponse)
async def get_onchain_vault_status(
    collateral_address: str,
    user: dict = Depends(get_current_user),
    supabase = Depends(get_supabase_admin_client)
):
    # This function remains unchanged
    user_id = user.get("sub")
    try:
        user_res = supabase.from_("profiles").select("wallet_address").eq("id", user_id).single().execute()

        if not user_res.data or not user_res.data.get("wallet_address"):
            return VaultStatusResponse(collateralAmount="0", mintedAmount="0", collateralValueUSD="0", collateralRatio="0", isLiquidatable=False, lastUpdateTime=0)
        
        user_wallet = Web3.to_checksum_address(user_res.data["wallet_address"])
        collateral_token_addr = Web3.to_checksum_address(collateral_address)

        w3 = get_web3_provider()
        vault_contract = w3.eth.contract(address=Web3.to_checksum_address(COLLATERAL_VAULT_ADDRESS), abi=COLLATERAL_VAULT_ABI)
        
        position_data = vault_contract.functions.getUserPosition(user_wallet, collateral_token_addr).call()

        PRECISION = 10**6
        
        return VaultStatusResponse(
            collateralAmount=str(position_data[0]),
            mintedAmount=str(Decimal(position_data[1]) / Decimal(PRECISION)),
            collateralValueUSD=str(Decimal(position_data[2]) / Decimal(PRECISION)),
            collateralRatio=f"{(Decimal(position_data[3]) / Decimal(PRECISION)) * 100:.2f}%",
            isLiquidatable=position_data[4],
            lastUpdateTime=position_data[5]
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve vault status: {e}")

# save_wallet_address endpoint remains unchanged
