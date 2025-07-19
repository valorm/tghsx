# In /backend/routes/liquidations.py

import os
from fastapi import APIRouter, Depends, HTTPException, status
from typing import List
from web3 import Web3
from pydantic import BaseModel
from decimal import Decimal

# Corrected Import Paths
from services.web3_client import get_web3_provider
from services.supabase_client import get_supabase_admin_client
from utils.utils import get_current_user, load_contract_abi

router = APIRouter()

# --- Load Contract Details ---
COLLATERAL_VAULT_ADDRESS = os.getenv("COLLATERAL_VAULT_ADDRESS")
if not COLLATERAL_VAULT_ADDRESS:
    raise RuntimeError("COLLATERAL_VAULT_ADDRESS is not set in the environment.")
COLLATERAL_VAULT_ABI = load_contract_abi("abi/CollateralVault.json")

# --- Pydantic Model for the response ---
class AtRiskVault(BaseModel):
    wallet_address: str
    collateral_address: str
    collateral_amount: str
    minted_amount: str
    collateralization_ratio: str
    is_liquidatable: bool

@router.get("/at-risk", response_model=List[AtRiskVault])
async def get_at_risk_vaults(
    user: dict = Depends(get_current_user),
    supabase = Depends(get_supabase_admin_client)
):
    """
    Scans all user profiles with vaults and returns those eligible for liquidation.
    """
    try:
        w3 = get_web3_provider()
        vault_contract = w3.eth.contract(address=Web3.to_checksum_address(COLLATERAL_VAULT_ADDRESS), abi=COLLATERAL_VAULT_ABI)
        
        # Fetch all profiles that have a saved wallet address and collateral type
        profiles_res = supabase.from_("profiles").select("wallet_address, default_collateral_address").neq("wallet_address", "null").neq("default_collateral_address", "null").execute()
        
        if not profiles_res.data:
            return []

        at_risk_vaults = []
        PRECISION = 10**6

        for profile in profiles_res.data:
            wallet_address = profile.get("wallet_address")
            collateral_token_address = profile.get("default_collateral_address")
            
            if not wallet_address or not collateral_token_address:
                continue

            # --- FIX: Correctly call getUserPosition and use the 'isLiquidatable' flag from the contract. ---
            # This is the single source of truth and much more reliable than calculating it here.
            # The contract returns: (collateralAmount, mintedAmount, collateralValue, collateralRatio, isLiquidatable, lastUpdateTime)
            position = vault_contract.functions.getUserPosition(
                Web3.to_checksum_address(wallet_address),
                Web3.to_checksum_address(collateral_token_address)
            ).call()
            
            is_liquidatable = position[4]

            if is_liquidatable:
                collateral_amount = str(position[0])
                minted_amount = str(Decimal(position[1]) / Decimal(PRECISION))
                collateral_ratio = f"{(Decimal(position[3]) / Decimal(PRECISION)) * 100:.2f}%"

                at_risk_vaults.append(AtRiskVault(
                    wallet_address=wallet_address,
                    collateral_address=collateral_token_address,
                    collateral_amount=collateral_amount,
                    minted_amount=minted_amount,
                    collateralization_ratio=collateral_ratio,
                    is_liquidatable=is_liquidatable
                ))

        return at_risk_vaults

    except Exception as e:
        print(f"ERROR fetching at-risk vaults: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve at-risk vaults: {e}"
        )
