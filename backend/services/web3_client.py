import os
from dotenv import load_dotenv
from web3 import Web3

# Load environment variables from .env file
load_dotenv()

# Use production RPC URL first, then fallback to local
RPC_URL = os.getenv("AMOY_RPC_URL") or os.getenv("LOCAL_RPC_URL") or "http://127.0.0.1:8545"

if not RPC_URL:
    raise ValueError("No RPC URL found. Please set AMOY_RPC_URL or LOCAL_RPC_URL environment variable.")

# Initialize Web3 provider
def get_web3_provider() -> Web3:
    """
    Initializes and returns a Web3 provider connected to the RPC URL.
    """
    try:
        # Connect to the provider
        w3 = Web3(Web3.HTTPProvider(RPC_URL, request_kwargs={'timeout': 30}))
        
        # Check connection status
        if not w3.is_connected():
            raise ConnectionError(f"Failed to connect to Web3 provider at {RPC_URL}. Please check your RPC URL and network connection.")
        
        print(f"DEBUG: Successfully connected to Web3 provider at {RPC_URL}")
        
        # Try to get network info for debugging
        try:
            chain_id = w3.eth.chain_id
            print(f"DEBUG: Connected to chain ID: {chain_id}")
        except Exception as e:
            print(f"DEBUG: Could not get chain ID: {e}")
            
        return w3
    except Exception as e:
        print(f"ERROR: Web3 provider connection failed: {e}")
        raise ConnectionError(f"Could not connect to Web3 provider: {e}")


# Alternative function with fallback providers
def get_web3_provider_with_fallback() -> Web3:
    """
    Tries multiple RPC providers in order of preference.
    """
    providers = [
        os.getenv("AMOY_RPC_URL"),
        os.getenv("LOCAL_RPC_URL"),
        "https://rpc-amoy.polygon.technology",  # Public Polygon Amoy RPC
        "http://127.0.0.1:8545"  # Local fallback
    ]
    
    for provider_url in providers:
        if not provider_url:
            continue
            
        try:
            print(f"DEBUG: Trying to connect to {provider_url}")
            w3 = Web3(Web3.HTTPProvider(provider_url, request_kwargs={'timeout': 30}))
            
            if w3.is_connected():
                print(f"DEBUG: Successfully connected to {provider_url}")
                return w3
            else:
                print(f"DEBUG: Connection failed to {provider_url}")
                
        except Exception as e:
            print(f"DEBUG: Error connecting to {provider_url}: {e}")
            continue
    
    raise ConnectionError("Could not connect to any Web3 provider")