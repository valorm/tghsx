import os
from dependencies import w3
from utils.abi_loader import load_abi

def get_contract(address_env_var, abi_name):
    """Generic function to get a contract instance."""
    contract_address = os.getenv(address_env_var)
    if not contract_address:
        raise ValueError(f"Environment variable {address_env_var} not set.")
    
    abi = load_abi(abi_name)
    if not abi:
        raise FileNotFoundError(f"ABI file {abi_name}.json not found.")

    if not w3:
        raise ConnectionError("Web3 client is not available. Check initialization.")

    return w3.eth.contract(address=contract_address, abi=abi)

def get_collateral_vault_contract():
    return get_contract("COLLATERAL_VAULT_ADDRESS", "CollateralVault")

def get_tghsx_token_contract():
    return get_contract("TGHSX_TOKEN_ADDRESS", "TGHSXToken")

def get_price_feed_contract():
    return get_contract("PRICE_FEED_ADDRESS", "AggregatorV3Interface")
