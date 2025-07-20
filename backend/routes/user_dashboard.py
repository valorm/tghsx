# In /backend/routes/user_dashboard.py

import os
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import Dict, Any, List
from web3 import Web3
from web3.middleware import geth_poa_middleware
from decimal import Decimal

# Corrected Import Paths
from services.web3_client import get_web3_provider
from services.supabase_client import get_supabase_admin_client
from utils.utils import get_current_user, load_contract_abi

router = APIRouter(prefix="/vault", tags=["User Vault"])

# --- Environment & ABI Loading ---
COLLATERAL_VAULT_ADDRESS = os.getenv("COLLATERAL_VAULT_ADDRESS")
if not COLLATERAL_VAULT_ADDRESS:
    raise RuntimeError("COLLATERAL_VAULT_ADDRESS is not set in the environment.")

COLLATERAL_VAULT_ABI = load_contract_abi("abi/CollateralVault.json")
PRECISION = 10**6

# --- Pydantic Models for clear response structures ---
class VaultStatusResponse(BaseModel):
    collateralAmount: str
    mintedAmount: str
    collateralValueUSD: str
    collateralRatio: str
    isLiquidatable: bool
    lastUpdateTime: int

class MintStatusResponse(BaseModel):
    dailyMinted: str
    remainingDaily: str
    lastMintTime: int
    cooldownRemaining: int
    dailyMintCount: int
    remainingMints: int

# --- Helper to get user wallet address ---
def get_user_wallet(user: dict = Depends(get_current_user), supabase = Depends(get_supabase_admin_client)) -> str:
    user_id = user.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Could not identify user from token.")
    
    profile_res = supabase.from_("profiles").select("wallet_address").eq("id", user_id).single().execute()
    if not profile_res.data or not profile_res.data.get("wallet_address"):
        raise HTTPException(status_code=404, detail="User profile or wallet address not found.")
        
    return Web3.to_checksum_address(profile_res.data["wallet_address"])

# --- User-Facing Endpoints ---

@router.get("/status/{collateral_address}", response_model=VaultStatusResponse)
async def get_onchain_vault_status(
    collateral_address: str,
    user_wallet: str = Depends(get_user_wallet)
):
    """Fetches the user's vault status for a specific collateral."""
    try:
        w3 = get_web3_provider()
        vault_contract = w3.eth.contract(address=Web3.to_checksum_address(COLLATERAL_VAULT_ADDRESS), abi=COLLATERAL_VAULT_ABI)
        
        position = vault_contract.functions.getUserPosition(
            user_wallet, 
            Web3.to_checksum_address(collateral_address)
        ).call()
        
        # position is a tuple: (collateralAmount, mintedAmount, collateralValue, collateralRatio, isLiquidatable, lastUpdateTime)
        collateral_config = vault_contract.functions.collateralConfigs(Web3.to_checksum_address(collateral_address)).call()
        collateral_decimals = collateral_config[5]

        return VaultStatusResponse(
            collateralAmount=str(Decimal(position[0]) / Decimal(10**collateral_decimals)),
            mintedAmount=str(Decimal(position[1]) / Decimal(PRECISION)),
            collateralValueUSD=str(Decimal(position[2]) / Decimal(PRECISION)),
            collateralRatio=f"{(Decimal(position[3]) / Decimal(PRECISION)) * 100:.2f}",
            isLiquidatable=position[4],
            lastUpdateTime=position[5]
        )
    except Exception as e:
        print(f"Error fetching vault status for {user_wallet}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch vault status: {str(e)}")


@router.get("/mint-status", response_model=MintStatusResponse)
async def get_user_mint_status(user_wallet: str = Depends(get_user_wallet)):
    """Fetches the user's minting status (cooldowns, daily limits, etc.)."""
    try:
        w3 = get_web3_provider()
        vault_contract = w3.eth.contract(address=Web3.to_checksum_address(COLLATERAL_VAULT_ADDRESS), abi=COLLATERAL_VAULT_ABI)
        
        status_data = vault_contract.functions.getUserMintStatus(user_wallet).call()
        
        # status_data is a tuple: (dailyMinted, remainingDaily, lastMintTime, cooldownRemaining, dailyMintCount, remainingMints)
        return MintStatusResponse(
            dailyMinted=str(Decimal(status_data[0]) / Decimal(PRECISION)),
            remainingDaily=str(Decimal(status_data[1]) / Decimal(PRECISION)),
            lastMintTime=status_data[2],
            cooldownRemaining=status_data[3],
            dailyMintCount=status_data[4],
            remainingMints=status_data[5]
        )
    except Exception as e:
        print(f"Error fetching mint status for {user_wallet}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to retrieve mint status: {str(e)}")

