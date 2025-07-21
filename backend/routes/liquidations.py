# In /backend/routes/liquidations.py

import os
import logging
import time
from fastapi import APIRouter, Depends, HTTPException, status
from typing import List, Dict
from web3 import Web3
from pydantic import BaseModel
from decimal import Decimal

# Corrected Import Paths
from services.web3_client import get_web3_provider_with_fallback as get_web3_provider
from services.supabase_client import get_supabase_admin_client
from services.oracle_service import get_eth_ghs_price
from services.web3_service import send_admin_transaction
from utils.utils import is_admin_user, load_contract_abi
from fastapi_cache.decorator import cache

# --- Setup ---
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# FIX: Removed the redundant prefix="/liquidations" from the router definition.
router = APIRouter(tags=["Liquidations"])

# --- Environment & ABI Loading ---
COLLATERAL_VAULT_ADDRESS = os.getenv("COLLATERAL_VAULT_ADDRESS")
if not COLLATERAL_VAULT_ADDRESS:
    raise RuntimeError("COLLATERAL_VAULT_ADDRESS is not set in the environment.")
COLLATERAL_VAULT_ABI = load_contract_abi("abi/CollateralVault.json")
ERC20_ABI = load_contract_abi("abi/ERC20.json")

# --- Pydantic Models ---
class AtRiskVault(BaseModel):
    wallet_address: str
    collateral_address: str
    collateral_amount: str
    minted_amount: str
    collateralization_ratio: str
    is_liquidatable: bool

class LiquidationRequest(BaseModel):
    wallet_address: str
    collateral_address: str

# --- Liquidation Endpoints ---

@router.get("/at-risk", response_model=List[AtRiskVault])
@cache(expire=300) # Cache the results for 5 minutes
async def get_at_risk_vaults(
    user: dict = Depends(is_admin_user),
    supabase = Depends(get_supabase_admin_client)
):
    """
    Scans all user profiles with vaults and returns those eligible for liquidation.
    Handles data type conversions from on-chain uint256 to readable strings.
    """
    logger.info(f"Fetching at-risk vaults for admin user {user.get('sub')}")
    try:
        w3 = get_web3_provider()
        vault_contract = w3.eth.contract(address=Web3.to_checksum_address(COLLATERAL_VAULT_ADDRESS), abi=COLLATERAL_VAULT_ABI)
        
        profiles_res = supabase.table("profiles").select("wallet_address").neq("wallet_address", "null").execute()
        
        if not profiles_res.data:
            logger.info("No profiles with wallet addresses found to scan for at-risk vaults.")
            return []

        at_risk_vaults = []
        all_collaterals = vault_contract.functions.getAllCollateralTokens().call()

        for profile in profiles_res.data:
            wallet_address = profile.get("wallet_address")
            if not wallet_address:
                continue

            for collateral_token_address in all_collaterals:
                try:
                    position = vault_contract.functions.getUserPosition(
                        Web3.to_checksum_address(wallet_address),
                        Web3.to_checksum_address(collateral_token_address)
                    ).call()
                    
                    is_liquidatable = position[4]
                    if is_liquidatable:
                        # Fetch collateral decimals for accurate conversion
                        config = vault_contract.functions.collateralConfigs(Web3.to_checksum_address(collateral_token_address)).call()
                        collateral_decimals = config[5]
                        tghsx_decimals = 6 # tGHSX has 6 decimals

                        # Convert uint256 values to human-readable strings
                        collateral_amount = str(Decimal(position[0]) / Decimal(10**collateral_decimals))
                        minted_amount = str(Decimal(position[1]) / Decimal(10**tghsx_decimals))
                        collateral_ratio = f"{(Decimal(position[3]) / Decimal(10**6)) * 100:.2f}%"

                        at_risk_vaults.append(AtRiskVault(
                            wallet_address=wallet_address,
                            collateral_address=collateral_token_address,
                            collateral_amount=collateral_amount,
                            minted_amount=minted_amount,
                            collateralization_ratio=collateral_ratio,
                            is_liquidatable=is_liquidatable
                        ))
                        logger.info(f"Found at-risk vault for wallet: {wallet_address} with collateral: {collateral_token_address}")
                except Exception as e:
                    logger.error(f"Could not fetch position for wallet {wallet_address} with collateral {collateral_token_address}: {str(e)}")
        
        return at_risk_vaults
    except Exception as e:
        logger.error(f"A critical error occurred while retrieving at-risk vaults: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve at-risk vaults: {str(e)}"
        )

@router.post("/liquidate", response_model=Dict[str, str])
async def liquidate_vault(
    request: LiquidationRequest,
    user: dict = Depends(is_admin_user)
):
    """
    Executes a liquidation transaction for a specified at-risk vault.
    """
    logger.info(f"Admin {user.get('sub')} initiating liquidation for wallet {request.wallet_address}")
    try:
        w3 = get_web3_provider()
        vault_contract = w3.eth.contract(address=Web3.to_checksum_address(COLLATERAL_VAULT_ADDRESS), abi=COLLATERAL_VAULT_ABI)
        
        function_call = vault_contract.functions.liquidate(
            Web3.to_checksum_address(request.wallet_address),
            Web3.to_checksum_address(request.collateral_address)
        )
        
        tx_hash = send_admin_transaction(function_call)
        logger.info(f"Successfully submitted liquidation transaction for wallet {request.wallet_address}. Tx Hash: {tx_hash}")
        
        return {"message": "Liquidation transaction submitted successfully.", "transaction_hash": tx_hash}
    except Exception as e:
        logger.error(f"Failed to liquidate vault for wallet {request.wallet_address}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to liquidate vault: {str(e)}")
