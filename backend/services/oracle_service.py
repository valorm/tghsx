# In /backend/services/oracle_service.py

import os
from web3 import Web3
from web3.contract import Contract
from typing import Dict, Any
import json
import time

from services.web3_client import get_web3_provider
from utils.utils import load_contract_abi # Assuming utils is in the parent directory

# --- Environment & ABI Loading ---
# This service is designed for Chainlink and is self-contained.
# It does not need to know about the CollateralVault contract.
PRICE_FEED_ABI_PATH = "abi/AggregatorV3Interface.json"
ETH_USD_PRICE_FEED_ADDRESS = os.getenv("CHAINLINK_ETH_USD_PRICE_FEED_ADDRESS")
USD_GHS_PRICE_FEED_ADDRESS = os.getenv("CHAINLINK_USD_GHS_PRICE_FEED_ADDRESS")

# --- In-memory Cache ---
price_cache: Dict[str, Any] = {}
CACHE_TTL = 60 # Cache prices for 60 seconds

# --- ABI Loading ---
try:
    AGGREGATOR_V3_ABI = load_contract_abi(PRICE_FEED_ABI_PATH)
except Exception as e:
    raise RuntimeError(f"CRITICAL ERROR loading AggregatorV3Interface ABI: {e}")

def get_price_feed_contract(w3: Web3, address: str) -> Contract:
    """Returns a Web3 contract instance for a Chainlink AggregatorV3Interface."""
    if not Web3.is_address(address):
        raise ValueError(f"Invalid contract address provided: '{address}'") 
    return w3.eth.contract(address=Web3.to_checksum_address(address), abi=AGGREGATOR_V3_ABI)

def fetch_latest_price(price_feed_contract: Contract, retries: int = 3, delay: int = 2) -> Dict[str, int]:
    """Fetches the latest price from a Chainlink contract with retries."""
    for attempt in range(retries):
        try:
            # latestRoundData returns: (roundId, answer, startedAt, updatedAt, answeredInRound)
            round_data = price_feed_contract.functions.latestRoundData().call()
            price = round_data[1]
            timestamp = round_data[3]
            
            if price <= 0:
                raise ValueError("Price feed returned a non-positive price.")
            if time.time() - timestamp > 3600: # 1 hour
                raise ValueError(f"Price feed data is stale (updated at {timestamp}).")

            return {
                "price": price,
                "timestamp": timestamp,
                "decimals": price_feed_contract.functions.decimals().call()
            }
        except Exception as e:
            print(f"Error fetching price from {price_feed_contract.address} (attempt {attempt+1}/{retries}): {e}")
            if attempt < retries - 1:
                time.sleep(delay)
            else:
                raise RuntimeError(f"Failed to fetch price from Chainlink after {retries} retries.")
    raise RuntimeError("Exited price fetch loop unexpectedly.")

def get_eth_ghs_price() -> Dict[str, Any]:
    """
    Calculates and returns the ETH/GHS price using Chainlink feeds.
    This is a synchronous function suitable for FastAPI endpoints.
    """
    cache_key = "eth_ghs_price"
    
    if cache_key in price_cache and (time.time() - price_cache[cache_key]["fetch_time"]) < CACHE_TTL:
        return price_cache[cache_key]["data"]

    if not ETH_USD_PRICE_FEED_ADDRESS or not USD_GHS_PRICE_FEED_ADDRESS:
        raise ValueError("Chainlink price feed addresses are not set in environment variables.")

    w3 = get_web3_provider()
    
    try:
        eth_usd_contract = get_price_feed_contract(w3, ETH_USD_PRICE_FEED_ADDRESS)
        usd_ghs_contract = get_price_feed_contract(w3, USD_GHS_PRICE_FEED_ADDRESS)

        eth_usd_data = fetch_latest_price(eth_usd_contract)
        usd_ghs_data = fetch_latest_price(usd_ghs_contract)

        # ETH/USD price has 'd' decimals. USD/GHS price has 'd' decimals.
        # (eth_usd * 10^d) * (usd_ghs * 10^d) / (10^d * 10^d) = eth_ghs
        # To maintain precision, we combine them before division.
        # The final price will have the same number of decimals as the ETH/USD feed.
        eth_ghs_raw_price = (eth_usd_data['price'] * usd_ghs_data['price']) // (10**usd_ghs_data['decimals'])
        
        result = {
            "eth_ghs_price": eth_ghs_raw_price,
            "eth_usd_price": eth_usd_data['price'],
            "usd_ghs_price": usd_ghs_data['price'],
            "timestamp": max(eth_usd_data['timestamp'], usd_ghs_data['timestamp']),
            "decimals": eth_usd_data['decimals']
        }

        price_cache[cache_key] = {
            "data": result,
            "fetch_time": time.time()
        }
        return result
    except Exception as e:
        print(f"CRITICAL: Could not calculate ETH/GHS price. Error: {e}")
        raise e
