import os
import json
from dependencies import w3

def load_abi(name):
    """
    Loads a contract ABI from the 'abi' directory.
    This function is now part of contract_service to avoid import cycles.
    """
    # Construct the full path to the ABI file
    # __file__ is the path to the current file (contract_service.py)
    # os.path.dirname(__file__) is the directory it's in (services)
    # '..' goes up one level to the 'backend' directory
    path = os.path.join(os.path.dirname(__file__), '..', 'abi', f'{name}.json')
    try:
        with open(path, 'r') as f:
            # Load the entire JSON file and return the value of the 'abi' key
            return json.load(f)['abi']
    except FileNotFoundError:
        print(f"ERROR: ABI file not found at {path}")
        return None
    except (json.JSONDecodeError, KeyError) as e:
        print(f"ERROR: Could not load or parse ABI file at {path}: {e}")
        return None

def get_contract(address_env_var, abi_name):
    """Generic function to get a contract instance."""
    contract_address = os.getenv(address_env_var)
    if not contract_address:
        raise ValueError(f"Environment variable {address_env_var} not set.")
    
    abi = load_abi(abi_name)
    if not abi:
        raise FileNotFoundError(f"ABI file {abi_name}.json could not be loaded.")

    if not w3:
        raise ConnectionError("Web3 client is not available. Check initialization in dependencies.py.")

    return w3.eth.contract(address=contract_address, abi=abi)

def get_collateral_vault_contract():
    return get_contract("COLLATERAL_VAULT_ADDRESS", "CollateralVault")

def get_tghsx_token_contract():
    return get_contract("TGHSX_TOKEN_ADDRESS", "TGHSXToken")

def get_price_feed_contract():
    return get_contract("PRICE_FEED_ADDRESS", "AggregatorV3Interface")
