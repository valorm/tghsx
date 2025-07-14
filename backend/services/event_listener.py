# In /backend/services/event_listener.py

import asyncio
import json
import os
import sys
import time
from web3 import Web3
from dotenv import load_dotenv

# --- Path Correction ---
try:
    backend_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    if backend_path not in sys.path:
        sys.path.insert(0, backend_path)
except Exception as e:
    print(f"Error adjusting system path: {e}")

from services.supabase_client import get_supabase_admin_client
from services.web3_client import get_web3_provider
from utils.utils import load_contract_abi

# --- Configuration ---
SUPABASE_CLIENT = get_supabase_admin_client()
W3 = get_web3_provider()
COLLATERAL_VAULT_ADDRESS = os.getenv("COLLATERAL_VAULT_ADDRESS")
COLLATERAL_VAULT_ABI = load_contract_abi("abi/CollateralVault.json")
VAULT_CONTRACT = W3.eth.contract(address=Web3.to_checksum_address(COLLATERAL_VAULT_ADDRESS), abi=COLLATERAL_VAULT_ABI)

# --- Helper Functions ---

def get_user_id_from_wallet(wallet_address: str, retries=5, delay=2) -> str:
    """Finds a user's ID based on their wallet address, with retries."""
    for i in range(retries):
        try:
            response = SUPABASE_CLIENT.from_("profiles").select("id").ilike("wallet_address", wallet_address).execute()
            if response.data:
                return response.data[0].get("id")
        except Exception as e:
            print(f"Attempt {i+1}: DB query error for wallet {wallet_address}: {e}")
        
        print(f"Attempt {i+1}/{retries}: User for wallet {wallet_address} not found. Retrying...")
        time.sleep(delay)
    return None

def format_event_data(event: dict) -> dict:
    """Formats raw event data into a structured dictionary for the database."""
    event_name = event.get("event")
    tx_hash = event.get("transactionHash").hex()
    block_number = event.get("blockNumber")
    
    try:
        block_info = W3.eth.get_block(block_number)
        timestamp = time.strftime('%Y-%m-%d %H:%M:%S', time.gmtime(block_info.timestamp))
    except Exception:
        timestamp = time.strftime('%Y-%m-%d %H:%M:%S', time.gmtime())

    user_wallet = event["args"].get("user")
    if not user_wallet:
        print(f"Warning: Event '{event_name}' missing 'user' arg. Skipping.")
        return None

    user_id = get_user_id_from_wallet(user_wallet)
    if not user_id:
        print(f"Warning: Skipping event for wallet {user_wallet} as no user profile was found.")
        return None

    # Convert all event arguments to string for JSON serialization
    event_args_json = {k: str(v) for k, v in event["args"].items()}

    return {
        "user_id": user_id,
        "tx_hash": tx_hash,
        "event_name": event_name,
        "event_data": json.dumps(event_args_json),
        "block_timestamp": timestamp,
    }

def save_transaction_to_db(tx_data: dict):
    """Saves the formatted transaction data to the Supabase 'transactions' table."""
    try:
        SUPABASE_CLIENT.table("transactions").upsert(tx_data, on_conflict="tx_hash").execute()
        print(f"Successfully saved event: {tx_data['event_name']} (Tx: {tx_data['tx_hash'][:10]}...)")
    except Exception as e:
        print(f"DATABASE ERROR: Failed to save transaction {tx_data['tx_hash']}. Reason: {e}")

# --- Main Event Loop ---

async def log_loop(event_filter, poll_interval, event_name):
    """The main asynchronous loop that polls for new events."""
    print(f"Listening for '{event_name}' events...")
    while True:
        try:
            for event in event_filter.get_new_entries():
                print(f"-> New event detected: {event.get('event')}")
                formatted_data = format_event_data(event)
                if formatted_data:
                    save_transaction_to_db(formatted_data)
            await asyncio.sleep(poll_interval)
        except Exception as e:
            print(f"ERROR in event loop for {event_name}: {e}. Restarting loop...")
            await asyncio.sleep(10)

def main():
    """Sets up event filters and starts the listening loops."""
    print("Starting blockchain event listener...")
    
    # FIX: Corrected event names to match CollateralVault.sol
    event_filters = {
        "CollateralDeposited": VAULT_CONTRACT.events.CollateralDeposited.create_filter(fromBlock='latest'),
        "CollateralWithdrawn": VAULT_CONTRACT.events.CollateralWithdrawn.create_filter(fromBlock='latest'),
        "TokensMinted": VAULT_CONTRACT.events.TokensMinted.create_filter(fromBlock='latest'),
        "TokensBurned": VAULT_CONTRACT.events.TokensBurned.create_filter(fromBlock='latest'),
        "PositionLiquidated": VAULT_CONTRACT.events.PositionLiquidated.create_filter(fromBlock='latest')
    }
    
    loop = asyncio.get_event_loop()
    try:
        tasks = [log_loop(filter, 2, name) for name, filter in event_filters.items()]
        loop.run_until_complete(asyncio.gather(*tasks))
    except KeyboardInterrupt:
        print("\nListener stopped by user.")
    finally:
        loop.close()

if __name__ == "__main__":
    main()
