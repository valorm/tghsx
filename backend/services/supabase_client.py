import os
from dotenv import load_dotenv
from supabase import create_client, Client
from functools import lru_cache
import validators
from requests.exceptions import HTTPError, ConnectionError as RequestsConnectionError

# Load environment variables from .env file
load_dotenv()

# Retrieve Supabase URL and Keys from environment variables
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY") # Anon key for client-side auth/public access
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY") # Service role key for backend-only operations

# FIX: Add validation for environment variables
if not SUPABASE_URL or not validators.url(SUPABASE_URL):
    raise ValueError(f"Invalid or missing SUPABASE_URL: {SUPABASE_URL}")
# Basic length check to catch obviously incorrect keys
if not SUPABASE_KEY or len(SUPABASE_KEY) < 50:
    raise ValueError("Invalid or missing SUPABASE_KEY. Please check your .env file.")
if not SUPABASE_SERVICE_KEY or len(SUPABASE_SERVICE_KEY) < 50:
    raise ValueError("Invalid or missing SUPABASE_SERVICE_KEY. This is required for backend operations.")

# FIX: Use lru_cache for singleton pattern and add enhanced error handling
@lru_cache(maxsize=1)
def get_supabase_client() -> Client:
    """
    Initializes and returns a Supabase client instance using the ANON key.
    Suitable for frontend-like operations that respect RLS.
    Caches the client instance for performance.
    """
    try:
        client = create_client(SUPABASE_URL, SUPABASE_KEY)
        # FIX: Test connection to ensure keys and URL are valid on first call
        client.auth.get_session()
        return client
    except RequestsConnectionError:
        raise RuntimeError("Failed to connect to Supabase: A network error occurred.")
    except HTTPError as e:
        raise RuntimeError(f"Failed to initialize Supabase client: Invalid credentials or configuration. Details: {str(e)}")
    except Exception as e:
        raise RuntimeError(f"An unexpected error occurred while initializing the Supabase client: {str(e)}")

@lru_cache(maxsize=1)
def get_supabase_admin_client() -> Client:
    """
    Initializes and returns a Supabase client instance using the SERVICE ROLE key.
    Suitable for backend operations that require elevated permissions and bypass RLS.
    Caches the client instance for performance.
    """
    try:
        client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
        # FIX: Test connection to ensure service key and URL are valid on first call
        client.auth.get_session()
        return client
    except RequestsConnectionError:
        raise RuntimeError("Failed to connect to Supabase (admin): A network error occurred.")
    except HTTPError as e:
        raise RuntimeError(f"Failed to initialize Supabase admin client: Invalid service role key or configuration. Details: {str(e)}")
    except Exception as e:
        raise RuntimeError(f"An unexpected error occurred while initializing the Supabase admin client: {str(e)}")


