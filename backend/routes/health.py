# In /backend/routes/health.py

import os
from fastapi import APIRouter, HTTPException, status, Depends

# Import the specific client and provider functions
from services.supabase_client import get_supabase_admin_client
from services.web3_client import get_web3_provider_with_fallback

router = APIRouter(prefix="/health", tags=["Health Checks"])

@router.get("/supabase", response_model=dict)
async def check_supabase_health():
    """Checks the connectivity and health of the Supabase client."""
    try:
        supabase = get_supabase_admin_client()
        # Perform a simple, non-intrusive query to test the connection and auth
        supabase.table("profiles").select("id").limit(1).execute()
        return {"status": "healthy", "message": "Supabase connection is active"}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Supabase connection failed: {str(e)}"
        )

@router.get("/web3", response_model=dict)
async def check_web3_health():
    """Checks the connectivity and health of the Web3 provider."""
    try:
        w3 = get_web3_provider_with_fallback()
        chain_id = w3.eth.chain_id
        block_number = w3.eth.block_number
        return {
            "status": "healthy", 
            "chain_id": chain_id, 
            "latest_block": block_number,
            "message": "Web3 provider is connected to Amoy."
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Web3 provider connection failed: {str(e)}"
        )

@router.get("/env", response_model=dict)
async def check_env_vars():
    """Verifies that all required environment variables are set."""
    required_vars = [
        "SUPABASE_URL", "SUPABASE_KEY", "SUPABASE_SERVICE_KEY", "SUPABASE_JWT_SECRET",
        "AMOY_RPC_URL", "ADMIN_PRIVATE_KEY",
        "COLLATERAL_VAULT_ADDRESS", "TGHSX_TOKEN_ADDRESS",
        "CHAINLINK_ETH_USD_PRICE_FEED_ADDRESS",
        "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"
    ]
    missing_vars = [var for var in required_vars if not os.getenv(var)]
    
    if missing_vars:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, 
            detail=f"Missing critical environment variables: {', '.join(missing_vars)}"
        )
        
    return {"status": "healthy", "message": "All required environment variables are set."}

