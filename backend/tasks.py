# In /backend/tasks.py

import asyncio
import logging
from decimal import Decimal
from web3 import Web3

# It's crucial that this task uses the same services and configs as the main app
from services.supabase_client import get_supabase_admin_client
from services.web3_client import get_web3_provider_with_fallback as get_web3_provider
from utils.utils import load_contract_abi
import os

# --- Setup ---
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- Environment & ABI Loading ---
COLLATERAL_VAULT_ADDRESS = os.getenv("COLLATERAL_VAULT_ADDRESS")
if not COLLATERAL_VAULT_ADDRESS:
    raise RuntimeError("Task setup failed: COLLATERAL_VAULT_ADDRESS is not set.")
COLLATERAL_VAULT_ABI = load_contract_abi("abi/CollateralVault.json")
TGHSX_DECIMALS = 6

async def sync_user_vaults():
    """
    A background task that periodically fetches on-chain vault data for all users
    and updates the `user_vaults` table in Supabase to ensure data consistency.
    """
    while True:
        logger.info("Starting periodic sync of user vaults with on-chain data...")
        try:
            supabase = get_supabase_admin_client()
            w3 = get_web3_provider()
            vault_contract = w3.eth.contract(address=Web3.to_checksum_address(COLLATERAL_VAULT_ADDRESS), abi=COLLATERAL_VAULT_ABI)
            
            # Get all profiles that have a registered wallet address
            profiles_res = supabase.table("profiles").select("id, wallet_address").neq("wallet_address", "null").execute()
            if not profiles_res.data:
                logger.info("Sync task: No user profiles with wallets found.")
                await asyncio.sleep(3600) # Wait for an hour before trying again
                continue

            all_collaterals = vault_contract.functions.getAllCollateralTokens().call()
            if not all_collaterals:
                logger.warning("Sync task: No collateral tokens found in the vault contract.")
                await asyncio.sleep(3600)
                continue

            for profile in profiles_res.data:
                user_id = profile["id"]
                wallet_address = profile["wallet_address"]
                
                for collateral_address in all_collaterals:
                    try:
                        position = vault_contract.functions.getUserPosition(
                            Web3.to_checksum_address(wallet_address),
                            Web3.to_checksum_address(collateral_address)
                        ).call()
                        
                        config = vault_contract.functions.collateralConfigs(Web3.to_checksum_address(collateral_address)).call()
                        collateral_decimals = config[5]

                        # Convert to human-readable format for storage
                        collateral_amount = str(Decimal(position[0]) / Decimal(10**collateral_decimals))
                        minted_amount = str(Decimal(position[1]) / Decimal(10**TGHSX_DECIMALS))

                        # Upsert the synchronized data into the user_vaults table
                        # This creates or updates the record based on a composite primary key (user_id, collateral_address)
                        supabase.table("user_vaults").upsert({
                            "user_id": user_id,
                            "collateral_address": collateral_address,
                            "eth_collateral": collateral_amount, # Column name might need adjustment
                            "tghsx_minted": minted_amount,
                            "last_synced": "now()"
                        }).execute()
                        logger.info(f"Synced vault for user {user_id} with collateral {collateral_address}")

                    except Exception as e:
                        logger.error(f"Failed to sync vault for user {user_id}, wallet {wallet_address}, collateral {collateral_address}: {e}")
        
        except Exception as e:
            logger.error(f"A critical error occurred during the user vault sync task: {str(e)}")
        
        # Wait for 1 hour before the next sync cycle
        await asyncio.sleep(3600)

# To run this task, you would typically start it in your main application file (e.g., main.py)
# using asyncio.create_task(sync_user_vaults()) within an async context.
