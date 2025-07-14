# In /backend/services/web3_service.py

import os
import json
from web3 import Web3
from web3.contract import Contract
from typing import Any

from .web3_client import get_web3_provider

# --- Environment Variables ---
# These now match your .env file exactly
TGHSX_TOKEN_ADDRESS = os.getenv("TGHSX_TOKEN_ADDRESS")
COLLATERAL_VAULT_ADDRESS = os.getenv("COLLATERAL_VAULT_ADDRESS")
MINTER_PRIVATE_KEY = os.getenv("MINTER_PRIVATE_KEY")

# --- ABI Paths ---
# Assumes you create an 'abi' folder in 'backend'
TGHSX_TOKEN_ABI_PATH = "abi/TGHSXToken.json"
COLLATERAL_VAULT_ABI_PATH = "abi/CollateralVault.json"

def load_contract_abi(filepath: str) -> Any:
    """Loads a JSON ABI from a Hardhat artifact file."""
    try:
        with open(filepath, 'r') as f:
            artifact = json.load(f)
            return artifact['abi']
    except Exception as e:
        raise FileNotFoundError(f"Could not load ABI from {filepath}. Ensure it exists. {e}")

# Load ABIs when the service module is loaded
try:
    TGHSX_TOKEN_ABI = load_contract_abi(TGHSX_TOKEN_ABI_PATH)
    # COLLATERAL_VAULT_ABI = load_contract_abi(COLLATERAL_VAULT_ABI_PATH) # Will be used in later tasks
except FileNotFoundError as e:
    print(f"CRITICAL ERROR: {e}")
    raise SystemExit(e)

async def mint_tokens_for_user(recipient_address: str, amount_wei: int) -> str:
    """
    Calls the mint function on the TGHSXToken smart contract.

    Returns:
        The transaction hash as a hex string.
    """
    if not MINTER_PRIVATE_KEY or not TGHSX_TOKEN_ADDRESS:
        raise ValueError("MINTER_PRIVATE_KEY or TGHSX_TOKEN_ADDRESS is not set in .env")

    w3 = get_web3_provider()
    contract = w3.eth.contract(address=Web3.to_checksum_address(TGHSX_TOKEN_ADDRESS), abi=TGHSX_TOKEN_ABI)
    
    minter_account = w3.eth.account.from_key(MINTER_PRIVATE_KEY)
    
    try:
        tx_payload = {
            'from': minter_account.address,
            'nonce': w3.eth.get_transaction_count(minter_account.address),
        }
        
        mint_tx = contract.functions.mint(
            Web3.to_checksum_address(recipient_address),
            amount_wei
        ).build_transaction(tx_payload)
        
        signed_tx = w3.eth.account.sign_transaction(mint_tx, private_key=MINTER_PRIVATE_KEY)
        tx_hash = w3.eth.send_raw_transaction(signed_tx.rawTransaction)
        tx_receipt = w3.eth.wait_for_transaction_receipt(tx_hash)
        
        if tx_receipt['status'] == 0:
            raise Exception("On-chain transaction failed.")
            
        return tx_hash.hex()
    except Exception as e:
        print(f"ERROR: On-chain minting failed for address {recipient_address}. Reason: {e}")
        raise e