# In /backend/services/web3_service.py

import os
import re
import logging
from typing import Any
import backoff
from web3 import Web3
from web3.middleware import geth_poa_middleware
from web3.exceptions import ContractLogicError, Web3Exception

# FIX: Use the more reliable provider with fallback capabilities
from .web3_client import get_web3_provider_with_fallback as get_web3_provider

# --- Setup ---
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- Environment Variables & Validation ---
ADMIN_PRIVATE_KEY = os.getenv("ADMIN_PRIVATE_KEY")

# FIX: Add validation for the private key format on module load
if not ADMIN_PRIVATE_KEY or not re.match(r'^0x[0-9a-fA-F]{64}$', ADMIN_PRIVATE_KEY):
    raise ValueError("Invalid or missing ADMIN_PRIVATE_KEY. Must be a 64-character hexadecimal string starting with '0x'.")

# FIX: Add retry logic and a longer timeout for the entire transaction process
@backoff.on_exception(backoff.expo, (Web3Exception, ConnectionError), max_tries=3, max_time=300)
def send_admin_transaction(function_call: Any) -> str:
    """
    A utility function to send a transaction from the admin account.
    This is used for contract functions restricted to an admin role.
    Includes EIP-1559 gas pricing, robust error handling, and retries.
    """
    logger.info(f"Initiating admin transaction for function: {function_call.fn_name}")
    w3 = get_web3_provider()
    w3.middleware_onion.inject(geth_poa_middleware, layer=0)
    
    try:
        admin_account = w3.eth.account.from_key(ADMIN_PRIVATE_KEY)
    except ValueError as e:
        logger.error(f"Invalid ADMIN_PRIVATE_KEY provided: {e}")
        raise ValueError(f"Invalid ADMIN_PRIVATE_KEY: {str(e)}")

    try:
        # FIX: Use maxPriorityFeePerGas and maxFeePerGas for EIP-1559 compatibility
        gas_price = w3.eth.gas_price
        priority_fee = int(gas_price * 0.1) # Default priority fee
        try:
            fee_history = w3.eth.fee_history(10, 'latest', reward_percentiles=[20])
            base_fee = fee_history['baseFeePerGas'][-1]
            priority_fee = fee_history['reward'][0][0]
            max_fee_per_gas = int(base_fee * 1.5 + priority_fee)
        except Exception:
            logger.warning("Could not fetch EIP-1559 fee history, falling back to legacy gas price.")
            max_fee_per_gas = gas_price * 2

        # FIX: Add specific error handling for gas estimation
        try:
            gas_estimate = function_call.estimate_gas({'from': admin_account.address})
        except ContractLogicError as e:
            logger.error(f"Gas estimation failed: Transaction would revert. Reason: {e}")
            # Propagate a more user-friendly error
            if "onlyOwner" in str(e) or "AccessControl" in str(e):
                raise ValueError("Transaction failed: Admin account lacks the required role.")
            if "PriceStale" in str(e):
                raise ValueError("Transaction failed: Collateral price data is stale.")
            raise ValueError(f"Transaction would fail: {str(e)}")

        tx_payload = {
            'from': admin_account.address,
            'nonce': w3.eth.get_transaction_count(admin_account.address),
            'gas': int(gas_estimate * 1.2), # Add 20% buffer
            'maxFeePerGas': max_fee_per_gas,
            'maxPriorityFeePerGas': priority_fee,
        }
        
        transaction = function_call.build_transaction(tx_payload)
        signed_tx = w3.eth.account.sign_transaction(transaction, private_key=ADMIN_PRIVATE_KEY)
        tx_hash = w3.eth.send_raw_transaction(signed_tx.rawTransaction)
        
        logger.info(f"Admin transaction sent: {tx_hash.hex()}")
        
        # FIX: Increased timeout for waiting for receipt
        tx_receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=300)
        
        if tx_receipt['status'] == 0:
            logger.error(f"Admin transaction {tx_hash.hex()} failed on-chain.")
            raise Exception("Admin transaction failed on-chain (reverted).")
            
        logger.info(f"Admin transaction {tx_hash.hex()} confirmed successfully.")
        return tx_hash.hex()
        
    except Exception as e:
        logger.error(f"On-chain admin transaction failed unexpectedly. Reason: {e}")
        raise e
