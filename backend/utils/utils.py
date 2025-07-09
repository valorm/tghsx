# In /backend/utils/utils.py

import os
import json
from datetime import datetime, timedelta, timezone
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer
from jose import JWTError, jwt
from supabase import Client
from services.supabase_client import get_supabase_admin_client

# --- Environment Variable Loading ---
# This is the secret key used to sign our custom JWTs. It should be a long, random string.
# We are reusing the Supabase JWT secret for convenience, but in production, you might use a different one.
SECRET_KEY = os.getenv("SUPABASE_JWT_SECRET")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 # Token valid for 24 hours

if not SECRET_KEY:
    raise RuntimeError("CRITICAL: SUPABASE_JWT_SECRET is not set in the environment.")

# --- JWT Token Utilities ---

def create_access_token(data: dict, expires_delta: timedelta | None = None):
    """Creates a new JWT access token."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

# --- Authentication & Authorization Dependencies ---

bearer_scheme = HTTPBearer()

def get_current_user(token: str = Depends(bearer_scheme)) -> dict:
    """
    Dependency to decode and validate our custom JWT and get the user's data.
    This is used to protect most endpoints.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        # Decode the JWT using our secret key
        payload = jwt.decode(token.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
        # Return the entire payload so other dependencies can use it (e.g., to check roles)
        return payload
    except JWTError:
        raise credentials_exception

def is_admin_user(current_user: dict = Depends(get_current_user)):
    """
    Dependency that checks if the current user has the 'admin' role.
    This is used to protect all admin-only endpoints.
    """
    if current_user.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Operation not permitted: Administrator access required."
        )
    return current_user

# --- General Utilities ---

def load_contract_abi(filepath: str) -> any:
    """Loads a JSON ABI from a Hardhat artifact file."""
    try:
        # Correct the path to be relative to the project root if needed
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        full_path = os.path.join(base_dir, filepath)
        
        with open(full_path, 'r') as f:
            artifact = json.load(f)
            if 'abi' not in artifact:
                raise ValueError("ABI field not found in artifact file.")
            return artifact['abi']
    except FileNotFoundError:
        raise FileNotFoundError(f"Could not load ABI from {full_path}. Ensure it exists.")
    except Exception as e:
        raise RuntimeError(f"Failed to load contract ABI: {e}")
