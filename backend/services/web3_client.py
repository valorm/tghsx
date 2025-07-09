import os
from dotenv import load_dotenv
from web3 import Web3

# Load environment variables from .env file
load_dotenv()

# --- MODIFICATION: Point to a local RPC URL from environment variables ---
# You will need to set LOCAL_RPC_URL in your .env file
LOCAL_RPC_URL = os.getenv("LOCAL_RPC_URL", "http://127.0.0.1:8545")

if not LOCAL_RPC_URL:
    raise ValueError("LOCAL_RPC_URL environment variable not set.")

# Initialize Web3 provider
def get_web3_provider() -> Web3:
    """
    Initializes and returns a Web3 provider connected to the local Hardhat RPC URL.
    """
    try:
        # Connect to the local provider
        w3 = Web3(Web3.HTTPProvider(LOCAL_RPC_URL, request_kwargs={'timeout': 30}))
        
        # Check connection status
        if not w3.is_connected():
            raise ConnectionError(f"Failed to connect to Web3 provider at {LOCAL_RPC_URL}. Please ensure your Hardhat node is running.")
        
        print(f"DEBUG: Successfully connected to Web3 provider at {LOCAL_RPC_URL}")
        return w3
    except Exception as e:
        print(f"ERROR: Web3 provider connection failed: {e}")
        raise ConnectionError(f"Could not connect to Web3 provider: {e}")