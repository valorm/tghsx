# In /backend/routes/transactions.py

from fastapi import APIRouter, Depends, HTTPException, status
from typing import List, Dict, Any
import json

# Corrected Import Paths
from services.supabase_client import get_supabase_admin_client
from utils.utils import get_current_user

router = APIRouter()

@router.get("/", response_model=Dict[str, Any])
async def get_transaction_history(
    user: dict = Depends(get_current_user),
    supabase = Depends(get_supabase_admin_client),
    page: int = 1,
    limit: int = 10,
    type: str = "all" # Add type filter parameter
):
    """
    Fetches a paginated transaction history for the authenticated user.
    """
    # FIX: The user's ID is in the 'sub' (subject) claim of the JWT payload.
    user_id = user.get("sub")
    if not user_id:
        raise HTTPException(status_code=400, detail="Could not identify user from token.")

    try:
        # Calculate the start and end index for the requested page
        start_index = (page - 1) * limit
        end_index = start_index + limit - 1

        # Build the query
        query = (
            supabase.from_("transactions")
            .select("*", count="exact") # Request the total count of matching rows
            .eq("user_id", user_id)
            .order("block_timestamp", desc=True) # Order by most recent
            .range(start_index, end_index) # Apply the pagination range
        )

        # Apply the type filter if it's not 'all'
        if type != "all":
            query = query.eq("event_name", type)

        # Execute the query
        response = query.execute()
        
        # The Supabase client returns the total count in the 'count' attribute
        total_records = response.count if response.count is not None else 0
        
        return {"transactions": response.data, "total": total_records}

    except Exception as e:
        print(f"ERROR fetching transaction history for user {user_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve transaction history: {e}"
        )
