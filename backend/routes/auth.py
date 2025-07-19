# In /backend/routes/auth.py

import os
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from supabase import Client
from gotrue.errors import AuthApiError

# Corrected Import Paths
from services.supabase_client import get_supabase_client
# --- NEW: Import JWT creation utility ---
from utils.utils import create_access_token

router = APIRouter()

# --- Get Admin User ID from environment variables ---
ADMIN_USER_ID = os.getenv("ADMIN_USER_ID")
if not ADMIN_USER_ID:
    raise RuntimeError("CRITICAL: ADMIN_USER_ID is not set in the environment.")

class UserCreate(BaseModel):
    email: str
    password: str

class UserLogin(BaseModel):
    email: str
    password: str

@router.post("/register", status_code=201)
async def register_user(request: UserCreate, db: Client = Depends(get_supabase_client)):
    """Handles new user registration via Supabase Auth."""
    try:
        response = db.auth.sign_up({"email": request.email, "password": request.password})
        if response.user:
             # --- FIX: Return a custom JWT upon successful registration for immediate login ---
             # This improves user experience by not requiring a separate login step after registering.
             user_id = str(response.user.id)
             role = "admin" if user_id == ADMIN_USER_ID else "user"
             access_token = create_access_token(data={"sub": user_id, "role": role})
             return {"access_token": access_token, "token_type": "bearer"}
        
        # This part should ideally not be reached if sign_up is successful
        raise HTTPException(status_code=500, detail="Registration failed unexpectedly.")
    except AuthApiError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/login")
async def login_user(request: UserLogin, db: Client = Depends(get_supabase_client)):
    """
    Handles user login.
    On success, it determines the user's role and returns a custom JWT.
    """
    try:
        # 1. Authenticate with Supabase
        response = db.auth.sign_in_with_password({"email": request.email, "password": request.password})
        
        if response.user and response.session:
            user_id = str(response.user.id)
            
            # 2. Determine the user's role
            # This is the single source of truth for the admin role.
            role = "admin" if user_id == ADMIN_USER_ID else "user"
            
            # 3. Create a new, custom JWT with the role embedded
            # The frontend will use this token for all subsequent requests.
            access_token = create_access_token(data={"sub": user_id, "role": role})
            
            return {"access_token": access_token, "token_type": "bearer"}
            
        raise HTTPException(status_code=401, detail="Login failed: Invalid credentials.")
    except AuthApiError as e:
        raise HTTPException(status_code=401, detail=str(e))
