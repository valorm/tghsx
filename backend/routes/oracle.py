# In /backend/routes/oracle.py

from fastapi import APIRouter, HTTPException
from typing import Dict, Any

from services.oracle_service import get_eth_ghs_price

router = APIRouter()

# CHANGED: 'async def' is now 'def' to run in a thread pool
@router.get("/price", response_model=Dict[str, Any])
def get_current_oracle_price():
    """
    Fetches the latest ETH/GHS price from Chainlink oracles.
    This is now a synchronous endpoint that FastAPI runs in a separate thread.
    """
    try:
        # CHANGED: 'await' keyword is removed
        price_data = get_eth_ghs_price()
        return price_data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve oracle price: {e}")