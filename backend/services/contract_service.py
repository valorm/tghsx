# In /backend/services/contract_service.py

import os
from web3 import Web3
from typing import Dict, Any
from decimal import Decimal

from services.web3_client import get_web3_provider
from utils.utils import load_contract_abi

# --- Environment & ABI Loading ---
COLLATERAL_VAULT_ADDRESS = os.getenv("COLLATERAL_VAULT_ADDRESS")
if not COLLATERAL_VAULT_ADDRESS:
    raise RuntimeError("COLLATERAL_VAULT_ADDRESS not set in environment.")

try:
    COLLATERAL_VAULT_ABI = load_contract_abi("abi/CollateralVault.json")
except Exception as e:
    raise RuntimeError(f"Failed to load CollateralVault ABI: {e}")


class OnChainContractService:
    """
    This service provides helper methods to interact directly with the
    CollateralVault smart contract, aligning with the updated backend routes.
    It replaces the previous off-chain simulation logic.
    """

    def __init__(self):
        """Initializes the service with a Web3 provider and contract instance."""
        self.w3 = get_web3_provider()
        if not self.w3.is_connected():
            raise ConnectionError("Failed to connect to Web3 provider.")
        self.vault_contract = self.w3.eth.contract(
            address=Web3.to_checksum_address(COLLATERAL_VAULT_ADDRESS),
            abi=COLLATERAL_VAULT_ABI
        )

    def get_user_position(self, user_address: str, collateral_address: str) -> Dict[str, Any]:
        """
        Fetches a user's detailed position directly from the smart contract.

        Args:
            user_address (str): The user's wallet address.
            collateral_address (str): The address of the collateral token.

        Returns:
            A dictionary containing the user's position details.
        """
        try:
            # The contract's getUserPosition returns a tuple:
            # (collateralAmount, mintedAmount, collateralValue, collateralRatio, isLiquidatable, lastUpdateTime)
            position_data = self.vault_contract.functions.getUserPosition(
                Web3.to_checksum_address(user_address),
                Web3.to_checksum_address(collateral_address)
            ).call()

            # Convert raw data to a more usable dictionary format
            # Note: The contract handles decimal precision, so we return the raw values
            # and let the calling route handle formatting for the API response.
            return {
                "collateralAmount": position_data[0],
                "mintedAmount": position_data[1],
                "collateralValue": position_data[2],
                "collateralRatio": position_data[3],
                "isLiquidatable": position_data[4],
                "lastUpdateTime": position_data[5]
            }
        except Exception as e:
            print(f"Error fetching user position for {user_address} with collateral {collateral_address}: {e}")
            # Return a zero-state dictionary on failure
            return {
                "collateralAmount": 0,
                "mintedAmount": 0,
                "collateralValue": 0,
                "collateralRatio": 0,
                "isLiquidatable": False,
                "lastUpdateTime": 0
            }

    def get_global_vault_status(self) -> Dict[str, Any]:
        """
        Fetches the global status of the vault from the smart contract.
        """
        try:
            # The contract's getVaultStatus returns a tuple:
            # (totalMinted, globalDailyMinted, globalDailyRemaining, autoMintEnabled, paused, totalCollateralTypes)
            status_data = self.vault_contract.functions.getVaultStatus().call()

            return {
                "totalMintedGlobal": status_data[0],
                "globalDailyMinted": status_data[1],
                "globalDailyRemaining": status_data[2],
                "isAutoMintEnabled": status_data[3],
                "isPaused": status_data[4],
                "totalCollateralTypes": status_data[5]
            }
        except Exception as e:
            print(f"Error fetching global vault status: {e}")
            return {}
