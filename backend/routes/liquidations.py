# In /backend/routes/liquidations.py

import os
from fastapi import APIRouter, Depends, HTTPException, status
from typing import List, Dict, Any
from web3 import Web3
# FIX: Import BaseModel from pydantic
from pydantic import BaseModel

# Corrected Import Paths
from services.web3_client import get_web3_provider
from services.supabase_client import get_supabase_admin_client
from utils.utils import get_current_user, load_contract_abi

router = APIRouter()

# --- Load Contract Details ---
COLLATERAL_VAULT_ADDRESS = os.getenv("COLLATERAL_VAULT_ADDRESS")
COLLATERAL_VAULT_ABI = load_contract_abi("abi/CollateralVault.json")

# --- Pydantic Model for the response ---
class AtRiskVault(BaseModel):
    wallet_address: str
    eth_collateral: str
    tghsx_minted: str
    collateralization_ratio: str

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
        
        # Fetch all user profiles that have a wallet address
        profiles_res = supabase.from_("profiles").select("wallet_address").neq("wallet_address", "null").execute()
        
        if not profiles_res.data:
            return []

        at_risk_vaults = []
        
        # Get the liquidation ratio from the smart contract
        # vaultConfig returns: (minCollateralRatio, liquidationRatio, maxCollateralRatio, lastConfigUpdate)
        config = vault_contract.functions.vaultConfig().call()
        liquidation_ratio_threshold = config[1]

        for profile in profiles_res.data:
            wallet_address = profile.get("wallet_address")
            if not wallet_address:
                continue

            # Fetch the user's position from the smart contract
            position = vault_contract.functions.getUserPosition(Web3.to_checksum_address(wallet_address)).call()
            
            # position returns: (ethCollateral, tghsxMinted, collateralizationRatio, isLiquidatable, accruedFees)
            collateralization_ratio = position[2]
            is_liquidatable = position[3]

            # Check if the vault is liquidatable based on the flag from the contract
            if is_liquidatable:
                at_risk_vaults.append(AtRiskVault(
                    wallet_address=wallet_address,
                    eth_collateral=str(position[0]),
                    tghsx_minted=str(position[1]),
                    collateralization_ratio=str(collateralization_ratio)
                ))

        return at_risk_vaults

    except Exception as e:
        print(f"ERROR fetching at-risk vaults: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve at-risk vaults: {e}"
        )
