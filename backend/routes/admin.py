# In /backend/routes/admin.py

import os
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import Dict, Any
from web3 import Web3
from web3.middleware import geth_poa_middleware
from decimal import Decimal

from services.web3_client import get_web3_provider
from utils.utils import is_admin_user, load_contract_abi

router = APIRouter()

COLLATERAL_VAULT_ADDRESS = os.getenv("COLLATERAL_VAULT_ADDRESS")
MINTER_PRIVATE_KEY = os.getenv("MINTER_PRIVATE_KEY")
if not COLLATERAL_VAULT_ADDRESS or not MINTER_PRIVATE_KEY:
    raise RuntimeError("Contract address or owner/minter key not set in environment.")

try:
    COLLATERAL_VAULT_ABI = load_contract_abi("abi/CollateralVault.json")
except Exception as e:
    raise RuntimeError(f"Failed to load CollateralVault ABI: {e}")

class GhsPriceUpdateRequest(BaseModel):
    new_price: str

class StalenessThresholdUpdateRequest(BaseModel):
    new_threshold: int

def send_admin_transaction(function_call):
    w3 = get_web3_provider()
    w3.middleware_onion.inject(geth_poa_middleware, layer=0)
    admin_account = w3.eth.account.from_key(MINTER_PRIVATE_KEY)
    try:
        gas_estimate = function_call.estimate_gas({'from': admin_account.address})
        gas_limit = int(gas_estimate * 1.2)
    except Exception as e:
        print(f"Gas estimation failed: {e}. Falling back to a default limit.")
        gas_limit = 200000
    tx_payload = {'from': admin_account.address, 'nonce': w3.eth.get_transaction_count(admin_account.address), 'gas': gas_limit, 'gasPrice': w3.eth.gas_price}
    tx = function_call.build_transaction(tx_payload)
    signed_tx = w3.eth.account.sign_transaction(tx, private_key=MINTER_PRIVATE_KEY)
    tx_hash = w3.eth.send_raw_transaction(signed_tx.rawTransaction)
    tx_receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
    if tx_receipt['status'] == 0:
        raise Exception("On-chain transaction failed.")
    return tx_hash.hex()

@router.get("/status", response_model=Dict[str, Any], dependencies=[Depends(is_admin_user)])
async def get_contract_status():
    try:
        w3 = get_web3_provider()
        vault_contract = w3.eth.contract(
            address=Web3.to_checksum_address(COLLATERAL_VAULT_ADDRESS), 
            abi=COLLATERAL_VAULT_ABI
        )
        
        is_paused = vault_contract.functions.paused().call()
        eth_btc_feed = vault_contract.functions.ethBtcPriceFeed().call()
        btc_usd_feed = vault_contract.functions.btcUsdPriceFeed().call()
        ghs_price_raw = vault_contract.functions.ghsUsdPrice().call()
        ghs_price_formatted = f"{(Decimal(ghs_price_raw) / Decimal('1e8')):.4f}"
        staleness_threshold = vault_contract.functions.priceStalenesThreshold().call()
        total_value_locked = vault_contract.functions.totalValueLocked().call()
        tvl_eth = f"{(Decimal(total_value_locked) / Decimal('1e18')):.4f}"
        vault_config = vault_contract.functions.vaultConfig().call()
        
        return {
            "isPaused": is_paused,
            "ethBtcPriceFeed": eth_btc_feed,
            "btcUsdPriceFeed": btc_usd_feed,
            "ghsUsdPrice": ghs_price_formatted,
            "priceStalenesThreshold": staleness_threshold,
            "totalValueLocked": tvl_eth,
            "vaultConfig": {
                "minCollateralRatio": vault_config[0],
                "liquidationRatio": vault_config[1],
                "maxCollateralRatio": vault_config[2],
                "lastConfigUpdate": vault_config[3]
            }
        }
    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail=f"Failed to fetch contract status: {str(e)}"
        )

@router.post("/update-ghs-price", response_model=Dict[str, str], dependencies=[Depends(is_admin_user)])
async def update_ghs_price(request: GhsPriceUpdateRequest):
    try:
        w3 = get_web3_provider()
        vault_contract = w3.eth.contract(
            address=Web3.to_checksum_address(COLLATERAL_VAULT_ADDRESS), 
            abi=COLLATERAL_VAULT_ABI
        )
        new_price_decimal = Decimal(request.new_price)
        new_price_wei = int(new_price_decimal * (10**8))
        if new_price_wei <= 0:
            raise HTTPException(status_code=400, detail="Price must be a positive number.")
        function_call = vault_contract.functions.updateGhsPrice(new_price_wei)
        tx_hash = send_admin_transaction(function_call)
        return {"message": "GHS price updated successfully.", "transactionHash": tx_hash}
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid price format.")
    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail=f"Failed to update GHS price: {str(e)}"
        )

@router.post("/update-staleness-threshold", response_model=Dict[str, str], dependencies=[Depends(is_admin_user)])
async def update_staleness_threshold(request: StalenessThresholdUpdateRequest):
    try:
        w3 = get_web3_provider()
        vault_contract = w3.eth.contract(
            address=Web3.to_checksum_address(COLLATERAL_VAULT_ADDRESS), 
            abi=COLLATERAL_VAULT_ABI
        )
        new_threshold = request.new_threshold
        if new_threshold < 300 or new_threshold > 86400:
            raise HTTPException(
                status_code=400, 
                detail="Threshold must be between 300 seconds (5 minutes) and 86400 seconds (24 hours)."
            )
        function_call = vault_contract.functions.updateStalenesThreshold(new_threshold)
        tx_hash = send_admin_transaction(function_call)
        return {"message": "Price staleness threshold updated successfully.", "transactionHash": tx_hash}
    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail=f"Failed to update staleness threshold: {str(e)}"
        )

@router.post("/pause", response_model=Dict[str, str], dependencies=[Depends(is_admin_user)])
async def pause_contract():
    try:
        w3 = get_web3_provider()
        vault_contract = w3.eth.contract(
            address=Web3.to_checksum_address(COLLATERAL_VAULT_ADDRESS), 
            abi=COLLATERAL_VAULT_ABI
        )
        # FIX: Call the correct function name from the Pausable contract ('pause' not 'emergencyPause')
        function_call = vault_contract.functions.pause()
        tx_hash = send_admin_transaction(function_call)
        return {"message": "Protocol paused successfully.", "transactionHash": tx_hash}
    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail=f"Failed to pause protocol: {str(e)}"
        )

@router.post("/unpause", response_model=Dict[str, str], dependencies=[Depends(is_admin_user)])
async def unpause_contract():
    try:
        w3 = get_web3_provider()
        vault_contract = w3.eth.contract(
            address=Web3.to_checksum_address(COLLATERAL_VAULT_ADDRESS), 
            abi=COLLATERAL_VAULT_ABI
        )
        # FIX: Call the correct function name from the Pausable contract ('unpause' not 'emergencyUnpause')
        function_call = vault_contract.functions.unpause()
        tx_hash = send_admin_transaction(function_call)
        return {"message": "Protocol resumed successfully.", "transactionHash": tx_hash}
    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail=f"Failed to resume protocol: {str(e)}"
        )

# --- The rest of the file remains the same ---
@router.get("/check-admin", response_model=Dict[str, bool], dependencies=[Depends(is_admin_user)])
async def check_admin_status():
    try:
        w3 = get_web3_provider()
        vault_contract = w3.eth.contract(
            address=Web3.to_checksum_address(COLLATERAL_VAULT_ADDRESS), 
            abi=COLLATERAL_VAULT_ABI
        )
        admin_account = w3.eth.account.from_key(MINTER_PRIVATE_KEY)
        is_admin = vault_contract.functions.isAdmin(admin_account.address).call()
        return {"isAdmin": is_admin}
    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail=f"Failed to check admin status: {str(e)}"
        )

@router.get("/price-feeds", response_model=Dict[str, Any])
async def get_price_feeds():
    try:
        w3 = get_web3_provider()
        vault_contract = w3.eth.contract(
            address=Web3.to_checksum_address(COLLATERAL_VAULT_ADDRESS), 
            abi=COLLATERAL_VAULT_ABI
        )
        eth_ghs_price = vault_contract.functions.getEthGhsPrice().call()
        eth_ghs_formatted = f"{(Decimal(eth_ghs_price) / Decimal('1e8')):.8f}"
        return {
            "ethGhsPrice": eth_ghs_formatted,
            "ethGhsPriceRaw": eth_ghs_price
        }
    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail=f"Failed to get price feeds: {str(e)}"
        )
