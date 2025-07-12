# In /backend/routes/oracle.py

import os
from fastapi import APIRouter, HTTPException
from typing import Dict, Any
from web3 import Web3
from decimal import Decimal

from services.web3_client import get_web3_provider
from utils.utils import load_contract_abi

router = APIRouter()

# --- Load Contract Details ---
COLLATERAL_VAULT_ADDRESS = os.getenv("COLLATERAL_VAULT_ADDRESS")
COLLATERAL_VAULT_ABI = load_contract_abi("abi/CollateralVault.json")

@router.get("/price", response_model=Dict[str, Any])
def get_current_oracle_price():
    """
    Fetches the latest combined ETH/GHS price directly from the CollateralVault smart contract.
    This is now the single source of truth for the price.
    """
    try:
        w3 = get_web3_provider()
        vault_contract = w3.eth.contract(address=Web3.to_checksum_address(COLLATERAL_VAULT_ADDRESS), abi=COLLATERAL_VAULT_ABI)
        
        # Call the getEthGhsPrice function from the smart contract
        eth_ghs_price_raw = vault_contract.functions.getEthGhsPrice().call()
        
        # The price has 8 decimals from the contract calculation
        decimals = 8
        
        return {
            "eth_ghs_price": eth_ghs_price_raw,
            "decimals": decimals,
            "source": "CollateralVault Contract"
        }
    except Exception as e:
        # This will now catch any on-chain errors, like if the price feeds are down.
        print(f"ERROR fetching on-chain price: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to retrieve on-chain price: {e}")
