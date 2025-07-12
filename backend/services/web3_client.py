import os
from dotenv import load_dotenv
from web3 import Web3

# Load environment variables from .env file
load_dotenv()

# --- FIX: Try multiple environment variable names for compatibility ---
def get_rpc_url():
    """
    Get RPC URL from environment variables with multiple fallbacks.
    """
    # Try different possible environment variable names
    possible_names = [
        "AMOY_RPC_URL",
        "POLYGON_AMOY_RPC_URL", 
        "RPC_URL",
        "WEB3_RPC_URL"
    ]
     
    for name in possible_names:
        url = os.getenv(name)
        if url:
            print(f"DEBUG: Found RPC URL from {name}")
            return url
    
    # If no production URL found, try local
    local_url = os.getenv("LOCAL_RPC_URL", "http://127.0.0.1:8545")
    print(f"WARNING: No production RPC URL found. Using local: {local_url}")
    return local_url

# Get RPC URL
RPC_URL = get_rpc_url()

if not RPC_URL:
    # Last resort - use a default public RPC
    RPC_URL = "https://polygon-amoy.infura.io/v3/97d4dafd786142e7ae24f1f3fc99ae73"
    print(f"WARNING: Using fallback RPC URL: {RPC_URL}")

print(f"DEBUG: Using RPC URL: {RPC_URL}")

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

# Additional helper function to test connection
def test_connection():
    """
    Test the Web3 connection and return connection status.
    """
    try:
        w3 = get_web3_provider()
        latest_block = w3.eth.get_block('latest')
        print(f"DEBUG: Connection test successful. Latest block: {latest_block.number}")
        return True
    except Exception as e:
        print(f"ERROR: Connection test failed: {e}")
        return False

# Get contract instance helper
def get_contract(address: str, abi: list):
    """
    Helper function to get a contract instance.
    """
    w3 = get_web3_provider()
    return w3.eth.contract(address=Web3.to_checksum_address(address), abi=abi)
