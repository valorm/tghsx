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

# Now we can import our project modules
from services.supabase_client import get_supabase_admin_client
from services.web3_client import get_web3_provider
from utils.utils import load_contract_abi

# --- Configuration ---
SUPABASE_CLIENT = get_supabase_admin_client()
W3 = get_web3_provider()
COLLATERAL_VAULT_ADDRESS = os.getenv("COLLATERAL_VAULT_ADDRESS")
COLLATERAL_VAULT_ABI = load_contract_abi("abi/CollateralVault.json")
VAULT_CONTRACT = W3.eth.contract(address=Web3.to_checksum_address(COLLATERAL_VAULT_ADDRESS), abi=COLLATERAL_VAULT_ABI)

# --- Helper Functions (Corrected) ---

def get_user_id_from_wallet(wallet_address: str, retries=5, delay=2) -> str:
    """
    Finds a user's ID based on their wallet address, with retries.
    This version uses a more robust query that doesn't rely on .single().
    """
    for i in range(retries):
        try:
            # FIX: Use a more robust query without .single()
            response = SUPABASE_CLIENT.from_("profiles").select("id").ilike("wallet_address", wallet_address).execute()
            
            # Check if the response contains data and has at least one result
            if response.data and len(response.data) > 0:
                if len(response.data) > 1:
                    print(f"Warning: Found multiple profiles for wallet {wallet_address}. Using the first one.")
                return response.data[0].get("id")

        except Exception as e:
            print(f"Attempt {i+1}: Error during DB query for wallet {wallet_address}: {e}")
        
        # If not found, wait and retry
        print(f"Attempt {i+1}/{retries}: User profile for wallet {wallet_address} not found. Retrying in {delay} seconds...")
        time.sleep(delay)
        
    print(f"Error: Could not find user ID for wallet {wallet_address} after {retries} retries.")
    return None

def format_event_data(event: dict) -> dict:
    """Formats raw event data into a structured dictionary for the database."""
    event_name = event.get("event")
    tx_hash = event.get("transactionHash").hex()
    block_number = event.get("blockNumber")
    
    try:
        block_info = W3.eth.get_block(block_number)
        timestamp = time.strftime('%Y-%m-%d %H:%M:%S', time.gmtime(block_info.timestamp))
    except Exception as e:
        print(f"Warning: Could not fetch block timestamp for block {block_number}. Error: {e}")
        timestamp = time.strftime('%Y-%m-%d %H:%M:%S', time.gmtime())

    user_wallet = event["args"].get("user")
    user_id = get_user_id_from_wallet(user_wallet)

    if not user_id:
        print(f"Warning: Skipping event for wallet {user_wallet} as no user profile was found.")
        return None

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
        print(f"Successfully saved transaction: {tx_data['event_name']} (Hash: {tx_data['tx_hash'][:10]}...)")
    except Exception as e:
        print(f"DATABASE ERROR: Failed to save transaction {tx_data['tx_hash']}. Reason: {e}")

# --- Main Event Loop ---

async def log_loop(event_filter, poll_interval, event_name):
    """The main asynchronous loop that polls for new events."""
    print(f"Listening for '{event_name}' events...")
    while True:
        try:
            for event in event_filter.get_new_entries():
                print(f"New event detected: {event.get('event')}")
                formatted_data = format_event_data(event)
                if formatted_data:
                    save_transaction_to_db(formatted_data)
            await asyncio.sleep(poll_interval)
        except Exception as e:
            print(f"ERROR in event loop for {event_name}: {e}. Restarting loop in 10 seconds...")
            await asyncio.sleep(10)

def main():
    """Sets up event filters and starts the listening loops."""
    print("Starting blockchain event listener...")
    
    deposit_filter = VAULT_CONTRACT.events.CollateralDeposited.create_filter(fromBlock='latest')
    mint_filter = VAULT_CONTRACT.events.TGHSXMinted.create_filter(fromBlock='latest')
    burn_filter = VAULT_CONTRACT.events.TGHSXBurned.create_filter(fromBlock='latest')
    withdraw_filter = VAULT_CONTRACT.events.CollateralWithdrawn.create_filter(fromBlock='latest')
    
    loop = asyncio.get_event_loop()
    try:
        loop.run_until_complete(asyncio.gather(
            log_loop(deposit_filter, 2, "CollateralDeposited"),
            log_loop(mint_filter, 2, "TGHSXMinted"),
            log_loop(burn_filter, 2, "TGHSXBurned"),
            log_loop(withdraw_filter, 2, "CollateralWithdrawn")
        ))
    except KeyboardInterrupt:
        print("\nListener stopped by user.")
    finally:
        loop.close()

if __name__ == "__main__":
    main()
