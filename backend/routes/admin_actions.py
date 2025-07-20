# In /backend/routes/admin_actions.py

import os
from fastapi import APIRouter, Depends, HTTPException, status, Body
from pydantic import BaseModel
from typing import List, Dict, Any

# Corrected Import Paths
from services.supabase_client import get_supabase_admin_client
from utils.utils import is_admin_user

router = APIRouter()

# --- Pydantic Models ---
class MintRequest(BaseModel):
    id: str
    user_id: str
    collateral_address: str
    mint_amount: str
    status: str
    created_at: str

# FIX: Add a model for the request body of approval/decline actions
class MintActionPayload(BaseModel):
    request_id: str

@router.get("/pending-requests", response_model=List[MintRequest], dependencies=[Depends(is_admin_user)])
async def get_pending_mint_requests(
    supabase = Depends(get_supabase_admin_client)
):
    """
    Fetches all mint requests with a 'pending' status for the admin panel.
    """
    try:
        response = (
            supabase.from_("mint_requests")
            .select("id, user_id, collateral_address, mint_amount, status, created_at")
            .eq("status", "pending")
            .order("created_at", desc=True)
            .execute()
        )
        
        if response.data is None:
            return []

        return response.data

    except Exception as e:
        print(f"ERROR fetching pending mint requests: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve pending mint requests: {str(e)}"
        )

# FIX: Add endpoint to approve a mint request
@router.post("/approve-mint", response_model=Dict[str, str], dependencies=[Depends(is_admin_user)])
async def approve_mint_request(
    payload: MintActionPayload,
    supabase = Depends(get_supabase_admin_client)
):
    """
    Approves a pending mint request by updating its status in the database.
    Note: This is an off-chain action. The user must still execute the on-chain transaction.
    """
    try:
        # Update the status of the request in the 'mint_requests' table
        (
            supabase.from_("mint_requests")
            .update({"status": "approved"})
            .eq("id", payload.request_id)
            .execute()
        )
        # In a real application, you might also trigger a notification to the user.
        return {"message": f"Mint request {payload.request_id} has been approved."}
    except Exception as e:
        print(f"ERROR approving mint request {payload.request_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to approve mint request: {str(e)}"
        )

# FIX: Add endpoint to decline a mint request
@router.post("/decline-mint", response_model=Dict[str, str], dependencies=[Depends(is_admin_user)])
async def decline_mint_request(
    payload: MintActionPayload,
    supabase = Depends(get_supabase_admin_client)
):
    """
    Declines a pending mint request by updating its status in the database.
    """
    try:
        # Update the status of the request in the 'mint_requests' table
        (
            supabase.from_("mint_requests")
            .update({"status": "declined"})
            .eq("id", payload.request_id)
            .execute()
        )
        return {"message": f"Mint request {payload.request_id} has been declined."}
    except Exception as e:
        print(f"ERROR declining mint request {payload.request_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to decline mint request: {str(e)}"
        )
