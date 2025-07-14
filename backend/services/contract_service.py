import os
from dotenv import load_dotenv
from typing import Dict, Any
from decimal import Decimal, getcontext

from supabase import Client
from services.supabase_client import get_supabase_client
from services.oracle_service import get_eth_ghs_price

# Load environment variables
load_dotenv()

# Set precision for Decimal calculations
getcontext().prec = 50  # High precision for financial calculations

# Constants (matching Solidity MIN_COLLATERAL_RATIO)
MIN_COLLATERAL_RATIO_PERCENT = Decimal(os.getenv("MIN_COLLATERAL_RATIO", "150"))

def _convert_decimals_to_str(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Recursively converts Decimal objects in a dictionary to strings.
    This ensures JSON serializability for numeric values.
    
    Args:
        data (Dict[str, Any]): The dictionary to process.
    
    Returns:
        Dict[str, Any]: A new dictionary with Decimal values converted to strings.
    """
    converted_data = {}
    for key, value in data.items():
        if isinstance(value, Decimal):
            # Handle special Decimal values
            if value.is_infinite():
                converted_data[key] = "Infinite"
            elif value.is_nan():
                converted_data[key] = "NaN"
            else:
                converted_data[key] = str(value)
        elif isinstance(value, dict):
            converted_data[key] = _convert_decimals_to_str(value)
        elif isinstance(value, list):
            converted_data[key] = [
                _convert_decimals_to_str(item) if isinstance(item, dict) 
                else str(item) if isinstance(item, Decimal) and not item.is_infinite() and not item.is_nan()
                else "Infinite" if isinstance(item, Decimal) and item.is_infinite()
                else "NaN" if isinstance(item, Decimal) and item.is_nan()
                else item 
                for item in value
            ]
        else:
            converted_data[key] = value
    return converted_data

class ContractService:
    def __init__(self, db: Client):
        """
        Initializes the ContractService with a Supabase client.
        
        Args:
            db (Client): The Supabase client instance.
        """
        self.db = db

    async def get_user_vault(self, user_id: str) -> Dict[str, Any]:
        """
        Retrieves a user's vault data from Supabase, or creates a new one if it doesn't exist.
        Ensures Decimal values are converted to strings for consistency.
        
        Args:
            user_id (str): The ID of the user.
        
        Returns:
            Dict[str, Any]: The user's vault data with Decimal values as strings.
        
        Raises:
            Exception: If vault creation fails.
        """
        response = self.db.from_("user_vaults").select("*").eq("user_id", user_id).limit(1).execute()

        if response.data:
            return _convert_decimals_to_str(response.data[0])
        else:
            # Create a new vault entry for the user if none exists
            new_vault = {
                "user_id": user_id,
                "eth_collateral": str(Decimal('0.0')),  # Convert to string immediately
                "tghsx_minted": str(Decimal('0.0'))      # Convert to string immediately
            }
            insert_response = self.db.from_("user_vaults").insert(new_vault).execute()
            if insert_response.data:
                return _convert_decimals_to_str(insert_response.data[0])
            else:
                raise Exception(f"Failed to create new user vault: {insert_response.last_error}")

    async def deposit_eth_collateral(self, user_id: str, amount_eth: Decimal) -> Dict[str, Any]:
        """
        Simulates depositing ETH collateral for a user by updating their Supabase vault.
        
        Args:
            user_id (str): The ID of the user.
            amount_eth (Decimal): The amount of ETH to deposit.
        
        Returns:
            Dict[str, Any]: A response with a message and updated vault data.
        
        Raises:
            ValueError: If the deposit amount is not positive.
            Exception: If the update fails.
        """
        if amount_eth <= 0:
            raise ValueError("Deposit amount must be greater than 0.")

        user_vault = await self.get_user_vault(user_id)
        current_eth_collateral = Decimal(user_vault.get("eth_collateral", "0.0"))
        new_eth_collateral = current_eth_collateral + amount_eth

        update_response = self.db.from_("user_vaults").update({
            "eth_collateral": str(new_eth_collateral)  # Convert to string for DB storage
        }).eq("user_id", user_id).execute()

        if update_response.data:
            return {
                "message": f"{amount_eth} ETH deposited successfully for user {user_id}",
                "vault": _convert_decimals_to_str(update_response.data[0])
            }
        else:
            raise Exception(f"Failed to update ETH collateral: {update_response.last_error}")

    async def mint_tghsx_tokens(self, user_id: str, amount_tghsx: Decimal) -> Dict[str, Any]:
        """
        Simulates minting tGHSX tokens for a user by updating their Supabase vault.
        Performs collateral ratio checks.
        
        Args:
            user_id (str): The ID of the user.
            amount_tghsx (Decimal): The amount of tGHSX to mint.
        
        Returns:
            Dict[str, Any]: A response with a message, updated vault data, and projected ratio.
        
        Raises:
            ValueError: If the mint amount is not positive or collateral ratio is insufficient.
            Exception: If the update fails or price data cannot be retrieved.
        """
        if amount_tghsx <= 0:
            raise ValueError("Mint amount must be greater than 0.")

        user_vault = await self.get_user_vault(user_id)
        current_eth_collateral = Decimal(user_vault.get("eth_collateral", "0.0"))
        current_tghsx_minted = Decimal(user_vault.get("tghsx_minted", "0.0"))
        new_tghsx_minted = current_tghsx_minted + amount_tghsx

        try:
            price_data = await get_eth_ghs_price()
            eth_ghs_price_raw = Decimal(str(price_data['eth_ghs_price']))
            price_decimals = Decimal(str(10**price_data['decimals']))
            collateral_value_ghs = (current_eth_collateral * eth_ghs_price_raw) / price_decimals
        except Exception as e:
            raise Exception(f"Unable to retrieve current ETH/GHS price for collateral calculation: {e}")

        if new_tghsx_minted <= 0:
            projected_ratio = Decimal(MIN_COLLATERAL_RATIO_PERCENT + 1)
        else:
            projected_ratio = (collateral_value_ghs / new_tghsx_minted) * Decimal(100)

        if projected_ratio < MIN_COLLATERAL_RATIO_PERCENT:
            raise ValueError(
                f"Collateral ratio ({projected_ratio:.2f}%) below minimum requirement "
                f"({MIN_COLLATERAL_RATIO_PERCENT}%). Add more collateral or mint less tGHSX."
            )

        update_response = self.db.from_("user_vaults").update({
            "tghsx_minted": str(new_tghsx_minted)  # Convert to string for DB storage
        }).eq("user_id", user_id).execute()

        if update_response.data:
            return {
                "message": f"{amount_tghsx} tGHSX minted successfully for user {user_id}",
                "vault": _convert_decimals_to_str(update_response.data[0]),
                "projected_ratio": f"{projected_ratio:.2f}%"
            }
        else:
            raise Exception(f"Failed to update tGHSX minted amount: {update_response.last_error}")

    async def get_vault_status(self, user_id: str) -> Dict[str, Any]:
        """
        Retrieves a user's vault status including current collateralization ratio.
        
        Args:
            user_id (str): The ID of the user.
        
        Returns:
            Dict[str, Any]: The vault status with all Decimal values as strings.
        """
        user_vault = await self.get_user_vault(user_id)
        eth_collateral = Decimal(user_vault.get("eth_collateral", "0.0"))
        tghsx_minted = Decimal(user_vault.get("tghsx_minted", "0.0"))

        collateral_value_ghs = Decimal(0)
        price_fetch_error = None

        if eth_collateral > 0:
            try:
                price_data = await get_eth_ghs_price()
                eth_ghs_price_raw = Decimal(str(price_data['eth_ghs_price']))
                price_decimals = Decimal(str(10**price_data['decimals']))
                collateral_value_ghs = (eth_collateral * eth_ghs_price_raw) / price_decimals
            except Exception as e:
                # Log the error but don't fail the entire request
                price_fetch_error = str(e)
                print(f"Warning: Failed to fetch ETH/GHS price: {e}")
                # Use a fallback value or set to 0 if price fetch fails
                collateral_value_ghs = Decimal(0)

        # Calculate ratio and determine health status
        if tghsx_minted > 0 and collateral_value_ghs > 0:
            current_ratio = (collateral_value_ghs / tghsx_minted) * Decimal(100)
            current_ratio_str = f"{current_ratio:.2f}%"
            is_healthy = current_ratio >= MIN_COLLATERAL_RATIO_PERCENT
        elif tghsx_minted > 0 and collateral_value_ghs == 0:
            # If we can't get price data, we can't calculate ratio
            current_ratio_str = "Unable to calculate (price data unavailable)"
            is_healthy = False
        elif eth_collateral > 0:
            current_ratio_str = "Infinite" if collateral_value_ghs > 0 else "Unable to calculate (price data unavailable)"
            is_healthy = collateral_value_ghs > 0  # Only healthy if we can get price data
        else:
            current_ratio_str = "0.00%"
            is_healthy = False

        # Build the status dict with all values as strings
        status = {
            "user_id": user_id,
            "eth_collateral": str(eth_collateral),
            "tghsx_minted": str(tghsx_minted),
            "collateral_value_ghs": str(collateral_value_ghs),
            "current_ratio": current_ratio_str,
            "is_healthy": is_healthy,  # Boolean is JSON serializable
        }
        
        # Add price fetch error info if there was one
        if price_fetch_error:
            status["price_fetch_error"] = price_fetch_error
            status["warning"] = "Collateral value and ratios may be inaccurate due to price feed unavailability"
        
        # Apply the conversion function as a final safety check
        return _convert_decimals_to_str(status)