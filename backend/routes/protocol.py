# In /backend/routes/protocol.py

import os
import time
import logging
from fastapi import APIRouter, Depends, HTTPException, status
from typing import Dict, Any, List
from web3 import Web3
from decimal import Decimal
from web3.exceptions import ContractLogicError

# Corrected Import Paths
from services.web3_client import get_web3_provider
from utils.utils import load_contract_abi

router = APIRouter()
logger = logging.getLogger(__name__)

# --- Load Contract Details ---
COLLATERAL_VAULT_ADDRESS = os.getenv("COLLATERAL_VAULT_ADDRESS")
if not COLLATERAL_VAULT_ADDRESS:
    raise RuntimeError("COLLATERAL_VAULT_ADDRESS is not set in the environment.")
    
COLLATERAL_VAULT_ABI = load_contract_abi("abi/CollateralVault.json")
ERC20_ABI = load_contract_abi("abi/ERC20.json") 
PRECISION = 10**6

@router.get("/health", response_model=Dict[str, Any])
async def get_protocol_health():
    """
    Calculates and returns aggregated health metrics for the protocol.
    This is a public endpoint and does not require authentication.
    """
    try:
        w3 = get_web3_provider()
        vault_contract = w3.eth.contract(address=Web3.to_checksum_address(COLLATERAL_VAULT_ADDRESS), abi=COLLATERAL_VAULT_ABI)

        status_data = vault_contract.functions.getVaultStatus().call()
        total_debt = Decimal(status_data[0]) / Decimal(PRECISION)

        total_value_locked_usd = Decimal(0)
        collateral_tokens = vault_contract.functions.getAllCollateralTokens().call()
        
        for token_address_str in collateral_tokens:
            # FIX: Add a try-except block to handle errors for individual collaterals gracefully.
            # This prevents the entire endpoint from failing if one collateral is misconfigured.
            try:
                token_address = Web3.to_checksum_address(token_address_str)
                
                # Skip zero addresses, which are sometimes used as placeholders
                if token_address == "0x0000000000000000000000000000000000000000":
                    logger.warning("Skipping zero address found in collateral tokens list.")
                    continue

                token_contract = w3.eth.contract(address=token_address, abi=ERC20_ABI)
                
                # This call will fail if the address is not a valid ERC20 contract
                vault_token_balance = token_contract.functions.balanceOf(COLLATERAL_VAULT_ADDRESS).call()
                
                collateral_config = vault_contract.functions.collateralConfigs(token_address).call()
                
                # Skip if collateral is not enabled
                if not collateral_config[0]:
                    continue

                price = Decimal(collateral_config[1]) / Decimal(PRECISION)
                token_decimals = collateral_config[5]
                
                collateral_value_usd = (Decimal(vault_token_balance) / Decimal(10**token_decimals)) * price
                total_value_locked_usd += collateral_value_usd
            except Exception as e:
                # Log the problematic collateral and continue to the next one
                logger.error(f"Could not process collateral token {token_address_str}. It might be misconfigured in the vault. Error: {e}")
                continue

        # Calculate Global Collateralization Ratio
        global_collateral_ratio_percent = 0.0
        if total_debt > 0:
            ratio = (total_value_locked_usd / total_debt) * 100
            global_collateral_ratio_percent = float(ratio)

        return {
            "totalValueLockedUSD": float(total_value_locked_usd),
            "totalDebt": float(total_debt),
            "globalCollateralizationRatio": global_collateral_ratio_percent,
            "isPaused": status_data[4],
            "numberOfCollateralTypes": status_data[5]
        }

    except ContractLogicError as e:
        logger.error(f"A contract logic error occurred while fetching protocol health: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"A contract error occurred: {e}"
        )
    except Exception as e:
        logger.error(f"An unexpected error occurred while fetching protocol health: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"An unexpected error occurred: {e}"
        )
