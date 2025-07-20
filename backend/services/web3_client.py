import os
from dotenv import load_dotenv
from web3 import Web3
import validators
import backoff
from web3.exceptions import Web3Exception
import logging

# --- Setup ---
load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- Configuration & Validation ---
# FIX: Add more fallback options, including a dedicated one for a premium RPC like Alchemy/Infura
RPC_PROVIDERS = [
    os.getenv("AMOY_RPC_URL"),
    os.getenv("ALCHEMY_AMOY_RPC_URL"), # Add a dedicated premium RPC for better reliability
    "https://rpc-amoy.polygon.technology",
    os.getenv("LOCAL_RPC_URL"),
    "http://127.0.0.1:8545"
]

# FIX: Validate URLs from the environment and filter out invalid or missing ones
VALID_RPC_URLS = [url for url in RPC_PROVIDERS if url and validators.url(url)]

if not VALID_RPC_URLS:
    raise ValueError("No valid RPC URL found. Please set AMOY_RPC_URL or another valid RPC environment variable.")

# Use the first valid URL as the primary one
RPC_URL = VALID_RPC_URLS[0]
AMOY_CHAIN_ID = 80002

# --- Web3 Provider Functions ---

# FIX: Add robust retry logic with exponential backoff
@backoff.on_exception(backoff.expo, (Web3Exception, ConnectionError), max_tries=3, max_time=60)
def get_web3_provider() -> Web3:
    """
    Initializes and returns a Web3 provider connected to the primary RPC URL.
    Includes validation, connection checks, and retry logic.
    """
    logger.info(f"Attempting to connect to primary Web3 provider at {RPC_URL}")
    try:
        w3 = Web3(Web3.HTTPProvider(RPC_URL, request_kwargs={'timeout': 30}))
        
        # FIX: Add connection and chain ID validation
        if not w3.is_connected():
            logger.error(f"Failed to connect to Web3 provider at {RPC_URL}")
            raise ConnectionError(f"Failed to connect to Web3 provider at {RPC_URL}.")
        
        chain_id = w3.eth.chain_id
        if chain_id != AMOY_CHAIN_ID:
            logger.error(f"Connected to incorrect chain ID {chain_id} at {RPC_URL}. Expected {AMOY_CHAIN_ID}.")
            raise ConnectionError(f"Connected to incorrect chain ID {chain_id}. Expected Amoy ({AMOY_CHAIN_ID}).")
        
        logger.info(f"Successfully connected to Web3 provider at {RPC_URL}, Chain ID: {chain_id}")
        return w3
    except Exception as e:
        logger.error(f"Web3 provider connection failed for {RPC_URL}: {e}")
        raise ConnectionError(f"Could not connect to Web3 provider: {e}")


@backoff.on_exception(backoff.expo, (Web3Exception, ConnectionError), max_tries=3, max_time=60)
def get_web3_provider_with_fallback() -> Web3:
    """
    Tries multiple RPC providers in order of preference, with validation and retries.
    This is the recommended function for all services to use for maximum reliability.
    """
    for provider_url in VALID_RPC_URLS:
        try:
            logger.info(f"Trying to connect to fallback provider: {provider_url}")
            w3 = Web3(Web3.HTTPProvider(provider_url, request_kwargs={'timeout': 30}))
            
            if w3.is_connected():
                chain_id = w3.eth.chain_id
                # FIX: Add chain ID validation within the loop
                if chain_id != AMOY_CHAIN_ID:
                    logger.warning(f"Connected to incorrect chain ID {chain_id} at {provider_url}. Skipping.")
                    continue
                
                logger.info(f"Successfully connected to {provider_url}, Chain ID: {chain_id}")
                return w3
            else:
                logger.warning(f"Connection failed to {provider_url}")
                
        except Exception as e:
            logger.error(f"Error connecting to {provider_url}: {e}")
            continue
    
    # This will only be reached if all providers fail
    raise ConnectionError("Could not connect to any of the configured Web3 providers.")
