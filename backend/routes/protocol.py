# In /backend/routes/protocol.py

import os
import time
from fastapi import APIRouter, Depends, HTTPException, status
from typing import Dict, Any, List
from web3 import Web3
from decimal import Decimal
from web3.exceptions import ContractLogicError

# Corrected Import Paths
from services.web3_client import get_web3_provider
from utils.utils import load_contract_abi

router = APIRouter()

# --- Load Contract Details ---
COLLATERAL_VAULT_ADDRESS = os.getenv("COLLATERAL_VAULT_ADDRESS")
if not COLLATERAL_VAULT_ADDRESS:
    raise RuntimeError("COLLATERAL_VAULT_ADDRESS is not set in the environment.")
    
COLLATERAL_VAULT_ABI = load_contract_abi("abi/CollateralVault.json")
ERC20_ABI = load_contract_abi("abi/ERC20.json") 
PRECISION = 10**6

# --- Helper Function for Price Staleness Check ---
async def check_price_validity(vault_contract, collateral_tokens: List[str]):
    """Checks if the prices for all collateral tokens are recent enough to be valid."""
    current_time = int(time.time())
    for token_address in collateral_tokens:
        config = vault_contract.functions.collateralConfigs(Web3.to_checksum_address(token_address)).call()
        if not config[0]: # Skip disabled collaterals
            continue
        last_update = config[2]  # lastPriceUpdate is a uint64 timestamp
        if current_time - last_update > 3600:  # 1-hour staleness check
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Price data for collateral {token_address} is stale. Please try again later."
            )

@router.get("/health", response_model=Dict[str, Any])
async def get_protocol_health():
    """
    Calculates and returns aggregated health metrics for the protocol.
    This is a public endpoint and does not require authentication.
    """
    try:
        w3 = get_web3_provider()
        vault_contract = w3.eth.contract(address=Web3.to_checksum_address(COLLATERAL_VAULT_ADDRESS), abi=COLLATERAL_VAULT_ABI)

        # FIX: Fetch all collateral tokens and check for price staleness
        collateral_tokens = vault_contract.functions.getAllCollateralTokens().call()
        if collateral_tokens:
            await check_price_validity(vault_contract, collateral_tokens)

        # Fetch total debt and vault status
        status_data = vault_contract.functions.getVaultStatus().call()
        total_debt = Decimal(status_data[0]) / Decimal(PRECISION)

        # Calculate Total Value Locked (TVL)
        total_value_locked_usd = Decimal(0)
        for token_address_str in collateral_tokens:
            token_address = Web3.to_checksum_address(token_address_str)
            collateral_config = vault_contract.functions.collateralConfigs(token_address).call()
            
            # FIX: Skip collateral if it's not enabled
            if not collateral_config[0]:
                continue

            token_contract = w3.eth.contract(address=token_address, abi=ERC20_ABI)
            vault_token_balance = token_contract.functions.balanceOf(COLLATERAL_VAULT_ADDRESS).call()
            
            price = Decimal(collateral_config[1]) / Decimal(PRECISION)
            token_decimals = collateral_config[5]
            
            collateral_value_usd = (Decimal(vault_token_balance) / Decimal(10**token_decimals)) * price
            total_value_locked_usd += collateral_value_usd

        # Calculate Global Collateralization Ratio
        global_collateral_ratio_percent = 0.0
        if total_debt > 0:
            ratio = (total_value_locked_usd / total_debt) * 100
            global_collateral_ratio_percent = float(ratio)

        # FIX: Return numeric values instead of formatted strings
        return {
            "totalValueLockedUSD": float(total_value_locked_usd),
            "totalDebt": float(total_debt),
            "globalCollateralizationRatio": global_collateral_ratio_percent,
            "isPaused": status_data[4],
            "numberOfCollateralTypes": status_data[5]
        }

    except HTTPException as http_exc:
        raise http_exc
    # FIX: Add specific error handling for contract reverts
    except ContractLogicError as e:
        if "PriceStale" in str(e):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Price data is stale. Please try again later."
            )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"A contract error occurred: {str(e)}"
        )
    except Exception as e:
        print(f"ERROR fetching protocol health: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve protocol health metrics: {str(e)}"
        )
