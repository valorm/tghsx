# In /backend/routes/oracle.py

from fastapi import APIRouter, HTTPException, status
from typing import Dict, Any

# Assuming the service is in the services directory
from services.oracle_service import get_eth_ghs_price

router = APIRouter(prefix="/oracle", tags=["Oracle"])

@router.get("/price", response_model=Dict[str, Any])
def get_oracle_price():
    """
    Fetches the latest aggregated ETH/GHS price from the oracle service.
    This endpoint returns human-readable price data.
    """
    try:
        # The service now returns data in a frontend-friendly format
        price_data = get_eth_ghs_price()
        return {
            "eth_usd_price": price_data["eth_usd_price"],
            "usd_ghs_price": price_data["usd_ghs_price"],
            "eth_ghs_price": price_data["eth_ghs_price"],
            "decimals": price_data["decimals"], # Kept for context, though prices are pre-formatted
            "last_update": price_data["timestamp"]
        }
    except Exception as e:
        # The service layer will raise specific exceptions, which we catch here
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch oracle price: {str(e)}"
        )

