# In /backend/routes/auth.py

import os
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from supabase import Client
from gotrue.errors import AuthApiError
from jose import jwt, JWTError
from fastapi.security import OAuth2PasswordBearer

from services.supabase_client import get_supabase_client, get_supabase_admin_client
from utils.utils import create_access_token

router = APIRouter(prefix="/auth", tags=["Authentication"])

# --- Environment Variables ---
ADMIN_USER_ID = os.getenv("ADMIN_USER_ID")
SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET")
if not ADMIN_USER_ID or not SUPABASE_JWT_SECRET:
    raise RuntimeError("CRITICAL: ADMIN_USER_ID or SUPABASE_JWT_SECRET is not set.")

# --- OAuth2 Scheme ---
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")

# --- Pydantic Models ---
class UserCreate(BaseModel):
    email: str
    password: str

class UserLogin(BaseModel):
    email: str
    password: str

# --- Authentication Dependencies ---
def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
    """Decodes and validates the JWT to get the current user."""
    try:
        payload = jwt.decode(
            token,
            SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            options={"verify_aud": False} # Supabase default audience is 'authenticated'
        )
        user_id: str = payload.get("sub")
        role: str = payload.get("role") # Role we added during login
        if user_id is None or role is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")
        return {"sub": user_id, "role": role}
    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Could not validate credentials: {str(e)}"
        )

def require_admin_role(current_user: dict = Depends(get_current_user)):
    """Dependency to ensure the current user has the 'admin' role."""
    if current_user.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required for this resource."
        )
    return current_user

# --- Authentication Endpoints ---
@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register_user(request: UserCreate, db: Client = Depends(get_supabase_client)):
    try:
        response = db.auth.sign_up({"email": request.email, "password": request.password})
        if response.user:
             user_id = str(response.user.id)
             role = "admin" if user_id == ADMIN_USER_ID else "user"
             access_token = create_access_token(data={"sub": user_id, "role": role})
             return {"access_token": access_token, "token_type": "bearer"}
        raise HTTPException(status_code=500, detail="Registration failed unexpectedly.")
    except AuthApiError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/login")
async def login_user(request: UserLogin, db: Client = Depends(get_supabase_client)):
    try:
        response = db.auth.sign_in_with_password({"email": request.email, "password": request.password})
        if response.user and response.session:
            user_id = str(response.user.id)
            role = "admin" if user_id == ADMIN_USER_ID else "user"
            access_token = create_access_token(data={"sub": user_id, "role": role})
            return {"access_token": access_token, "token_type": "bearer"}
        raise HTTPException(status_code=401, detail="Invalid credentials.")
    except AuthApiError as e:
        raise HTTPException(status_code=401, detail=str(e))

