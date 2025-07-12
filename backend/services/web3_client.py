import os
from dotenv import load_dotenv
from web3 import Web3

# Load environment variables from .env file
load_dotenv()

# --- FIX: Prioritize the production RPC URL and provide a clear error if it's missing ---
# When deployed, it MUST use the AMOY_RPC_URL. The local URL is only for local development.
RPC_URL = os.getenv("AMOY_RPC_URL")

if not RPC_URL:
    # If the production URL is not found, check for a local one.
    # This allows for easy local testing without changing the code.
    print("WARNING: AMOY_RPC_URL not found. Falling back to LOCAL_RPC_URL.")
    RPC_URL = os.getenv("LOCAL_RPC_URL")

if not RPC_URL:
    raise ValueError("CRITICAL: No RPC URL found. Please set AMOY_RPC_URL or LOCAL_RPC_URL in your environment variables.")

# Initialize Web3 provider
def get_web3_provider() -> Web3:
    """
    Initializes and returns a Web3 provider connected to the configured RPC URL.
    """
    try:
        print(f"DEBUG: Attempting to connect to Web3 provider at {RPC_URL}")
        w3 = Web3(Web3.HTTPProvider(RPC_URL, request_kwargs={'timeout': 30}))
        
        if not w3.is_connected():
            raise ConnectionError(f"Failed to connect to Web3 provider at {RPC_URL}. Please check the URL and your network connection.")
        
        chain_id = w3.eth.chain_id
        print(f"DEBUG: Successfully connected to Web3 provider. Chain ID: {chain_id}")
        
        return w3
    except Exception as e:
        print(f"ERROR: Web3 provider connection failed: {e}")
        raise ConnectionError(f"Could not connect to Web3 provider: {e}")

