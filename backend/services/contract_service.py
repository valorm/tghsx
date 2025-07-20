# In /backend/services/contract_service.py

import os
import time
from web3 import Web3
from typing import Dict, Any
from decimal import Decimal
from web3.exceptions import ContractLogicError
from fastapi import HTTPException, status

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
    CollateralVault smart contract. It includes validation, error handling,
    and unit conversions for consistency across the application.
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
        self.PRECISION = 10**6

    # FIX: Add a proactive price staleness check
    def check_price_validity(self, collateral_address: str = None):
        """Checks if collateral prices are updated within the last hour."""
        try:
            collateral_tokens_to_check = []
            if collateral_address:
                collateral_tokens_to_check.append(collateral_address)
            else:
                # If no specific address, check all registered collaterals
                collateral_tokens_to_check = self.vault_contract.functions.getAllCollateralTokens().call()

            current_time = int(time.time())
            for token in collateral_tokens_to_check:
                config = self.vault_contract.functions.collateralConfigs(Web3.to_checksum_address(token)).call()
                if not config[0]: # Skip disabled collaterals
                    continue
                last_update = config[2] # lastPriceUpdate timestamp
                if current_time - last_update > 3600: # 1 hour
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Price data for collateral {token} is stale."
                    )
        except HTTPException as http_exc:
            raise http_exc
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to check price validity: {str(e)}"
            )

    def get_user_position(self, user_address: str, collateral_address: str) -> Dict[str, Any]:
        """
        Fetches and normalizes a user's position, with validation and error handling.
        """
        try:
            # FIX: Add input address validation
            if not Web3.is_address(user_address) or not Web3.is_address(collateral_address):
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid user or collateral address.")
            
            # FIX: Proactively check for stale prices before calling the contract
            self.check_price_validity(collateral_address)

            config = self.vault_contract.functions.collateralConfigs(Web3.to_checksum_address(collateral_address)).call()
            collateral_decimals = config[5]
            
            position_data = self.vault_contract.functions.getUserPosition(
                Web3.to_checksum_address(user_address),
                Web3.to_checksum_address(collateral_address)
            ).call()

            # FIX: Add unit conversions for consistency
            return {
                "collateralAmount": float(Decimal(position_data[0]) / Decimal(10**collateral_decimals)),
                "mintedAmount": float(Decimal(position_data[1]) / Decimal(self.PRECISION)),
                "collateralValue": float(Decimal(position_data[2]) / Decimal(self.PRECISION)),
                "collateralRatio": float(Decimal(position_data[3]) / Decimal(self.PRECISION)),
                "isLiquidatable": position_data[4],
                "lastUpdateTime": position_data[5]
            }
        except HTTPException as http_exc:
            raise http_exc
        # FIX: Add specific error handling for contract reverts
        except ContractLogicError as e:
            if "PriceStale" in str(e):
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Price data is stale.")
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Contract error: {str(e)}")
        except Exception as e:
            print(f"Error in get_user_position for {user_address}: {e}")
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to fetch user position.")

    def get_global_vault_status(self) -> Dict[str, Any]:
        """
        Fetches and normalizes the global status of the vault, with error handling.
        """
        try:
            # FIX: Proactively check all collateral prices
            self.check_price_validity()
            
            status_data = self.vault_contract.functions.getVaultStatus().call()

            # FIX: Add unit conversions and handle errors gracefully
            return {
                "totalMintedGlobal": float(Decimal(status_data[0]) / Decimal(self.PRECISION)),
                "globalDailyMinted": float(Decimal(status_data[1]) / Decimal(self.PRECISION)),
                "globalDailyRemaining": float(Decimal(status_data[2]) / Decimal(self.PRECISION)),
                "isAutoMintEnabled": status_data[3],
                "isPaused": status_data[4],
                "totalCollateralTypes": status_data[5]
            }
        except HTTPException as http_exc:
            raise http_exc
        except ContractLogicError as e:
            if "PriceStale" in str(e):
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Price data is stale.")
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Contract error: {str(e)}")
        except Exception as e:
            print(f"Error in get_global_vault_status: {e}")
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to fetch global vault status.")
