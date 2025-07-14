# In /backend/routes/protocol.py

import os
from fastapi import APIRouter, Depends, HTTPException, status
from typing import Dict, Any
from web3 import Web3
from decimal import Decimal

# Corrected Import Paths
from services.web3_client import get_web3_provider
from services.supabase_client import get_supabase_admin_client
from services.oracle_service import get_eth_ghs_price
from utils.utils import get_current_user, load_contract_abi

router = APIRouter()

# --- Load Contract Details ---
COLLATERAL_VAULT_ADDRESS = os.getenv("COLLATERAL_VAULT_ADDRESS")
COLLATERAL_VAULT_ABI = load_contract_abi("abi/CollateralVault.json")

@router.get("/health", response_model=Dict[str, Any])
async def get_protocol_health(
    # For MVP, we secure it. In production, this might be a public endpoint.
    user: dict = Depends(get_current_user),
    supabase = Depends(get_supabase_admin_client)
):
    """
    Calculates and returns the latest aggregated health metrics for the protocol on-the-fly.
    """
    try:
        # --- Step 1: Fetch On-Chain and Off-Chain Data ---
        w3 = get_web3_provider()
        vault_contract = w3.eth.contract(address=Web3.to_checksum_address(COLLATERAL_VAULT_ADDRESS), abi=COLLATERAL_VAULT_ABI)

        # Get Total Value Locked directly from the smart contract
        total_value_locked_wei = vault_contract.functions.totalValueLocked().call()
        total_value_locked_eth = Web3.from_wei(total_value_locked_wei, 'ether')

        # Get all approved mint requests from the database to calculate total debt
        approved_requests_res = supabase.from_("mint_requests").select("mint_amount, user_id").eq("status", "approved").execute()
        
        total_debt = Decimal(0)
        active_vaults = set()

        if approved_requests_res.data:
            for req in approved_requests_res.data:
                total_debt += Decimal(req['mint_amount'])
                active_vaults.add(req['user_id'])
        
        number_of_vaults = len(active_vaults)

        # --- Step 2: Calculate Average Collateralization Ratio ---
        avg_collateral_ratio = "0"
        if total_debt > 0:
            try:
                # Get the current ETH price to value the collateral
                price_data = get_eth_ghs_price()
                eth_price_ghs = Decimal(str(price_data['eth_ghs_price'])) / Decimal(10**price_data['decimals'])
                
                total_collateral_value_ghs = total_value_locked_eth * eth_price_ghs
                
                # Calculate the global collateralization ratio for the protocol
                ratio = (total_collateral_value_ghs / total_debt) * 100
                avg_collateral_ratio = f"{ratio:.2f}"
            except Exception as price_error:
                print(f"Warning: Could not calculate average ratio due to price error: {price_error}")
                avg_collateral_ratio = "N/A"

        # --- Step 3: Return the compiled data ---
        return {
            "totalValueLocked": str(total_value_locked_eth),
            "totalDebt": str(total_debt),
            "numberOfVaults": number_of_vaults,
            "averageCollateralizationRatio": avg_collateral_ratio
        }

    except Exception as e:
        print(f"ERROR fetching protocol health: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve protocol health metrics: {e}"
        )
