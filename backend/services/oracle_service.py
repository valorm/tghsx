# In /backend/services/oracle_service.py

import os
from web3 import Web3
from web3.contract import Contract
from web3.exceptions import ContractCustomError, ContractLogicError, Web3ValidationError, BadFunctionCallOutput
from typing import Dict, Any
import json
import time

from services.web3_client import get_web3_provider

# Load environment variables
PRICE_FEED_ABI_PATH = "abi/AggregatorV3Interface.json"
ETH_USD_PRICE_FEED_ADDRESS = os.getenv("CHAINLINK_ETH_USD_PRICE_FEED_ADDRESS", "").strip()
USD_GHS_PRICE_FEED_ADDRESS = os.getenv("CHAINLINK_USD_GHS_PRICE_FEED_ADDRESS", "").strip()

# Basic in-memory cache for prices
price_cache: Dict[str, Any] = {}
CACHE_TTL = 60 # Cache Time-To-Live in seconds

def load_abi(filepath: str) -> Any:
    """Loads a JSON ABI from the given filepath."""
    try:
        with open(filepath, 'r') as f:
            full_artifact = json.load(f)
            if 'abi' in full_artifact:
                return full_artifact['abi']
            else:
                raise ValueError(f"ABI file at {filepath} does not contain an 'abi' field.")
    except FileNotFoundError:
        raise FileNotFoundError(f"ABI file not found at: {filepath}.")
    except json.JSONDecodeError:
        raise ValueError(f"Invalid JSON in ABI file at: {filepath}.")

try:
    AGGREGATOR_V3_ABI = load_abi(PRICE_FEED_ABI_PATH)
except Exception as e:
    print(f"CRITICAL ERROR loading ABI: {e}")
    raise

def get_price_feed_contract(w3: Web3, address: str) -> Contract:
    """Returns a Web3 contract instance for a Chainlink AggregatorV3Interface."""
    if not Web3.is_address(address):
        raise ValueError(f"Invalid contract address provided: '{address}'") 
    return w3.eth.contract(address=Web3.to_checksum_address(address), abi=AGGREGATOR_V3_ABI)

def fetch_latest_price(price_feed_contract: Contract, retries: int = 3, delay: int = 2) -> Dict[str, int]:
    """Fetches the latest price from a Chainlink contract with retries (Synchronous)."""
    for i in range(retries):
        try:
            (roundId, answer, startedAt, updatedAt, answeredInRound) = price_feed_contract.functions.latestRoundData().call()
            if answer <= 0:
                raise ValueError("Price feed returned non-positive answer.")
            return {
                "price": answer,
                "timestamp": updatedAt,
                "decimals": price_feed_contract.functions.decimals().call()
            }
        except Exception as e:
            print(f"Error fetching price from {price_feed_contract.address} (attempt {i+1}/{retries}): {e}")
            if i < retries - 1:
                time.sleep(delay)
                continue
            raise RuntimeError(f"Failed to fetch price from Chainlink after {retries} retries.")
    raise RuntimeError("Unknown error during price fetching.")


# CHANGED: 'async def' is now 'def'
def get_eth_ghs_price() -> Dict[str, Any]:
    """
    Calculates and returns the ETH/GHS price using Chainlink feeds (Synchronous).
    """
    cache_key = "eth_ghs_price"
    
    if cache_key in price_cache and (time.time() - price_cache[cache_key]["timestamp"]) < CACHE_TTL:
        print("Returning cached price data.")
        return price_cache[cache_key]["data"]

    print("Cache stale or empty. Fetching new price data.")
    w3 = get_web3_provider()

    if not ETH_USD_PRICE_FEED_ADDRESS:
        raise ValueError("CHAINLINK_ETH_USD_PRICE_FEED_ADDRESS environment variable not set.")
    if not USD_GHS_PRICE_FEED_ADDRESS:
        raise ValueError("CHAINLINK_USD_GHS_PRICE_FEED_ADDRESS environment variable not set.")

    try:
        eth_usd_contract = get_price_feed_contract(w3, ETH_USD_PRICE_FEED_ADDRESS)
        usd_ghs_contract = get_price_feed_contract(w3, USD_GHS_PRICE_FEED_ADDRESS)

        eth_usd_data = fetch_latest_price(eth_usd_contract)
        usd_ghs_data = fetch_latest_price(usd_ghs_contract)

        eth_ghs_raw_price = (eth_usd_data['price'] * usd_ghs_data['price']) // (10**8)
        latest_timestamp = max(eth_usd_data['timestamp'], usd_ghs_data['timestamp'])

        result = {
            "eth_ghs_price": eth_ghs_raw_price,
            "eth_usd_price": eth_usd_data['price'],
            "usd_ghs_price": usd_ghs_data['price'],
            "timestamp": latest_timestamp,
            "decimals": eth_usd_data['decimals']
        }

        price_cache[cache_key] = {
            "data": result,
            "timestamp": time.time()
        }
        return result
    except Exception as e:
        print(f"Error in get_eth_ghs_price: {e}")
        raise e