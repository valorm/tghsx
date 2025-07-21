# In /backend/routes/collateral.py

import os
from fastapi import APIRouter, HTTPException
from typing import List, Dict, Any
from web3 import Web3
from pydantic import BaseModel

from services.web3_client import get_web3_provider
from utils.utils import load_contract_abi

# FIX: Use a more specific prefix to avoid conflicts, and remove it from the router itself.
router = APIRouter(tags=["Protocol Info"])

COLLATERAL_VAULT_ADDRESS = os.getenv("COLLATERAL_VAULT_ADDRESS")
COLLATERAL_VAULT_ABI = load_contract_abi("abi/CollateralVault.json")
# Using a generic ERC20 ABI to get symbol, name, and decimals
ERC20_ABI = load_contract_abi("abi/ERC20.json") 

class CollateralInfo(BaseModel):
    address: str
    symbol: str
    name: str
    decimals: int

@router.get("/collaterals", response_model=List[CollateralInfo])
async def get_enabled_collaterals():
    """
    Fetches a list of all enabled collateral tokens from the vault contract,
    including their symbol, name, and decimals.
    """
    try:
        w3 = get_web3_provider()
        vault_contract = w3.eth.contract(address=Web3.to_checksum_address(COLLATERAL_VAULT_ADDRESS), abi=COLLATERAL_VAULT_ABI)
        
        collateral_addresses = vault_contract.functions.getAllCollateralTokens().call()
        
        enabled_collaterals = []
        for addr in collateral_addresses:
            try:
                config = vault_contract.functions.collateralConfigs(addr).call()
                is_enabled = config[0]
                
                if is_enabled:
                    token_contract = w3.eth.contract(address=addr, abi=ERC20_ABI)
                    # Use try-except for symbol/name as some custom tokens might not have them
                    try:
                        symbol = token_contract.functions.symbol().call()
                    except Exception:
                        symbol = "N/A"
                    try:
                        name = token_contract.functions.name().call()
                    except Exception:
                        name = "Unknown Token"
                    
                    decimals = token_contract.functions.decimals().call()
                    
                    enabled_collaterals.append(CollateralInfo(
                        address=addr,
                        symbol=symbol,
                        name=name,
                        decimals=decimals
                    ))
            except Exception:
                # Gracefully skip any misconfigured addresses (like price feeds)
                continue
                
        return enabled_collaterals
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch collateral list: {str(e)}")
