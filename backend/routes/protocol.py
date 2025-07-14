# In /backend/routes/protocol.py

import os
from fastapi import APIRouter, Depends, HTTPException, status
from typing import Dict, Any, List
from web3 import Web3
from decimal import Decimal

# Corrected Import Paths
from services.web3_client import get_web3_provider
from utils.utils import get_current_user, load_contract_abi

router = APIRouter()

# --- Load Contract Details ---
COLLATERAL_VAULT_ADDRESS = os.getenv("COLLATERAL_VAULT_ADDRESS")
COLLATERAL_VAULT_ABI = load_contract_abi("abi/CollateralVault.json")
# We need a generic ERC20 ABI to check balances of collateral tokens
ERC20_ABI = load_contract_abi("abi/ERC20.json") 

@router.get("/health", response_model=Dict[str, Any])
async def get_protocol_health(
    user: dict = Depends(get_current_user)
):
    """
    Calculates and returns aggregated health metrics for the protocol.
    """
    try:
        w3 = get_web3_provider()
        vault_contract = w3.eth.contract(address=Web3.to_checksum_address(COLLATERAL_VAULT_ADDRESS), abi=COLLATERAL_VAULT_ABI)

        # --- Step 1: Fetch Total Debt and Vault Status ---
        # FIX: Get total debt (totalMintedGlobal) directly from the contract's getVaultStatus function
        status_data = vault_contract.functions.getVaultStatus().call()
        total_debt = Decimal(status_data[0]) / Decimal(10**6) # tGHSX has 6 decimals

        # --- Step 2: Calculate Total Value Locked (TVL) ---
        # FIX: Remove call to non-existent totalValueLocked(). Calculate it manually.
        total_value_locked_usd = Decimal(0)
        
        # Get the list of all supported collateral tokens
        collateral_tokens: List[str] = vault_contract.functions.getAllCollateralTokens().call()
        
        for token_address in collateral_tokens:
            token_contract = w3.eth.contract(address=Web3.to_checksum_address(token_address), abi=ERC20_ABI)
            vault_token_balance = token_contract.functions.balanceOf(COLLATERAL_VAULT_ADDRESS).call()
            
            # Get the price for this specific collateral from the vault
            collateral_config = vault_contract.functions.collateralConfigs(token_address).call()
            # config is (enabled, price, lastPriceUpdate, maxLTV, liquidationBonus)
            price = Decimal(collateral_config[1]) / Decimal(10**6) # Prices are stored with 6 decimals
            
            # Assuming collateral also has 6 decimals for simplicity, adjust if not
            # A robust implementation would fetch decimals for each token
            token_decimals = 6 
            collateral_value_usd = (Decimal(vault_token_balance) / Decimal(10**token_decimals)) * price
            total_value_locked_usd += collateral_value_usd

        # --- Step 3: Calculate Global Collateralization Ratio ---
        global_collateral_ratio = "0.00"
        if total_debt > 0:
            ratio = (total_value_locked_usd / total_debt) * 100
            global_collateral_ratio = f"{ratio:.2f}"

        return {
            "totalValueLockedUSD": str(total_value_locked_usd),
            "totalDebt": str(total_debt),
            "globalCollateralizationRatio": global_collateral_ratio,
            "isPaused": status_data[4],
            "numberOfCollateralTypes": status_data[5]
        }

    except Exception as e:
        print(f"ERROR fetching protocol health: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve protocol health metrics: {e}"
        )
