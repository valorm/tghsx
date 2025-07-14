# In /backend/services/web3_service.py

import os
import json
from web3 import Web3
from typing import Any

from .web3_client import get_web3_provider

"""
REFACTOR NOTE:

This service's original purpose was to perform on-chain actions like minting
using a centralized admin key. This was identified as incompatible with the
smart contract's design, which requires the user (`msg.sender`) to initiate
actions like `mintTokens`.

The responsibility for building and sending transactions has been moved
directly into the relevant backend route handlers (e.g., in `admin.py` for
admin-only actions like pausing the contract).

This file is kept as a placeholder for potential future web3 utilities
but is no longer central to the minting workflow.
"""

# --- Environment Variables ---
ADMIN_PRIVATE_KEY = os.getenv("MINTER_PRIVATE_KEY") # Renamed for clarity

def send_admin_transaction(contract: Any, function_name: str, args: list) -> str:
    """
    A utility function to send a transaction from the admin account.
    This can be used for contract functions that are restricted to an admin role.

    Args:
        contract: The web3 contract instance.
        function_name: The name of the function to call.
        args: A list of arguments for the function.

    Returns:
        The transaction hash as a hex string.
    """
    if not ADMIN_PRIVATE_KEY:
        raise ValueError("ADMIN_PRIVATE_KEY is not set in environment.")

    w3 = get_web3_provider()
    admin_account = w3.eth.account.from_key(ADMIN_PRIVATE_KEY)

    try:
        # Build the function call
        function_call = contract.functions[function_name](*args)

        # Estimate gas and build the transaction payload
        gas_estimate = function_call.estimate_gas({'from': admin_account.address})
        tx_payload = {
            'from': admin_account.address,
            'nonce': w3.eth.get_transaction_count(admin_account.address),
            'gas': int(gas_estimate * 1.2), # Add 20% buffer
            'gasPrice': w3.eth.gas_price,
        }
        
        # Build, sign, and send the transaction
        transaction = function_call.build_transaction(tx_payload)
        signed_tx = w3.eth.account.sign_transaction(transaction, private_key=ADMIN_PRIVATE_KEY)
        tx_hash = w3.eth.send_raw_transaction(signed_tx.rawTransaction)
        
        # Wait for the receipt and check status
        tx_receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
        if tx_receipt['status'] == 0:
            raise Exception(f"Admin transaction for '{function_name}' failed on-chain.")
            
        return tx_hash.hex()
        
    except Exception as e:
        print(f"ERROR: On-chain admin transaction failed for function '{function_name}'. Reason: {e}")
        raise e
