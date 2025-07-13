import os
from supabase import create_client, Client
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Get Supabase credentials from environment variables
supabase_url = os.environ.get("SUPABASE_URL")
supabase_key = os.environ.get("SUPABASE_KEY")

# Initialize the Supabase client
supabase_client: Client | None = None
if supabase_url and supabase_key:
    try:
        supabase_client = create_client(supabase_url, supabase_key)
        print("Supabase client initialized successfully.")
    except Exception as e:
        print(f"Failed to initialize Supabase client: {e}")
else:
    print("Warning: Supabase credentials not found. Supabase client not initialized.")
