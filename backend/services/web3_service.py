# In /backend/services/web3_service.py

import os
from web3 import Web3
from web3.middleware import geth_poa_middleware
from typing import Any

from .web3_client import get_web3_provider

# --- Environment Variables ---
# FIX: Use the clearer environment variable name
ADMIN_PRIVATE_KEY = os.getenv("ADMIN_PRIVATE_KEY")

def send_admin_transaction(function_call: Any) -> str:
    """
    A utility function to send a transaction from the admin account.
    This is used for contract functions restricted to an admin role.
    """
    if not ADMIN_PRIVATE_KEY:
        raise ValueError("ADMIN_PRIVATE_KEY is not set in environment.")

    w3 = get_web3_provider()
    w3.middleware_onion.inject(geth_poa_middleware, layer=0)
    admin_account = w3.eth.account.from_key(ADMIN_PRIVATE_KEY)

    try:
        gas_estimate = function_call.estimate_gas({'from': admin_account.address})
        tx_payload = {
            'from': admin_account.address,
            'nonce': w3.eth.get_transaction_count(admin_account.address),
            'gas': int(gas_estimate * 1.2), # Add 20% buffer
            'gasPrice': w3.eth.gas_price,
        }
        
        transaction = function_call.build_transaction(tx_payload)
        signed_tx = w3.eth.account.sign_transaction(transaction, private_key=ADMIN_PRIVATE_KEY)
        tx_hash = w3.eth.send_raw_transaction(signed_tx.rawTransaction)
        
        tx_receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=180)
        if tx_receipt['status'] == 0:
            raise Exception("Admin transaction failed on-chain.")
            
        return tx_hash.hex()
        
    except Exception as e:
        print(f"ERROR: On-chain admin transaction failed. Reason: {e}")
        raise e
