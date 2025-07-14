import os
from dotenv import load_dotenv
from supabase import create_client, Client

# Load environment variables from .env file
load_dotenv()

# Retrieve Supabase URL and Keys from environment variables
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY") # Anon key for client-side auth/public access
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY") # Service role key for backend-only operations

if not SUPABASE_URL:
    raise ValueError("SUPABASE_URL environment variable not set.")
if not SUPABASE_KEY:
    raise ValueError("SUPABASE_KEY environment variable not set.")
if not SUPABASE_SERVICE_KEY: # Crucial check for the service key
    raise ValueError("SUPABASE_SERVICE_KEY environment variable not set. This is required for backend operations bypassing RLS.")


def get_supabase_client() -> Client:
    """
    Initializes and returns a Supabase client instance using the ANON key.
    Suitable for frontend-like operations that respect RLS.
    """
    return create_client(SUPABASE_URL, SUPABASE_KEY)

def get_supabase_admin_client() -> Client:
    """
    Initializes and returns a Supabase client instance using the SERVICE ROLE key.
    Suitable for backend operations that require elevated permissions and bypass RLS.
    """
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

