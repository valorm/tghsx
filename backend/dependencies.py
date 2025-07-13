import os
from supabase import create_client, Client
from web3 import Web3
from dotenv import load_dotenv
from eth_account import Account
from web3.middleware import geth_poa_middleware

# Load environment variables from a .env file if it exists
load_dotenv()

# --- Supabase Client Initialization ---
supabase_url = os.environ.get("SUPABASE_URL")
supabase_key = os.environ.get("SUPABASE_KEY")
supabase_client: Client | None = None

if supabase_url and supabase_key:
    try:
        supabase_client = create_client(supabase_url, supabase_key)
        print("Supabase client initialized successfully.")
    except Exception as e:
        print(f"ERROR: Failed to initialize Supabase client: {e}")
else:
    print("WARN: Supabase credentials not found. Supabase client not initialized.")


# --- Web3 Client Initialization ---
def get_rpc_url():
    """Determines the correct RPC URL from environment variables."""
    rpc_url = os.getenv("POLYGON_AMOY_RPC_URL")
    if rpc_url:
        print("DEBUG: Found RPC URL from POLYGON_AMOY_RPC_URL")
        return rpc_url
    
    infura_project_id = os.getenv("WEB3_INFURA_PROJECT_ID")
    if infura_project_id:
        print("DEBUG: Falling back to WEB3_INFURA_PROJECT_ID for Infura RPC")
        return f"https://polygon-amoy.infura.io/v3/{infura_project_id}"
        
    raise ValueError("No RPC URL configured. Please set POLYGON_AMOY_RPC_URL or WEB3_INFURA_PROJECT_ID.")

try:
    w3 = Web3(Web3.HTTPProvider(get_rpc_url()))
    # Inject PoA middleware, necessary for Polygon and other PoA chains
    w3.middleware_onion.inject(geth_poa_middleware, layer=0)

    admin_private_key = os.getenv("ADMIN_PRIVATE_KEY")
    if admin_private_key:
        admin_account = Account.from_key(admin_private_key)
        w3.eth.default_account = admin_account.address
        print(f"DEBUG: Web3 client initialized. Default signing account: {admin_account.address}")
    else:
        print("WARN: ADMIN_PRIVATE_KEY not set. Web3 client initialized without a default signing account.")

except Exception as e:
    print(f"ERROR: Failed to initialize Web3 client: {e}")
    w3 = None

