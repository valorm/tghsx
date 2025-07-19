# In /backend/utils/utils.py

import os
import json
from datetime import datetime, timedelta, timezone
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer
from jose import JWTError, jwt

# --- Environment Variable Loading ---
SECRET_KEY = os.getenv("SUPABASE_JWT_SECRET")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 # Token valid for 24 hours

if not SECRET_KEY:
    raise RuntimeError("CRITICAL: SUPABASE_JWT_SECRET is not set in the environment.")

# --- JWT Token Utilities ---

def create_access_token(data: dict, expires_delta: timedelta | None = None):
    """
    Creates a new JWT access token containing the provided data.
    """
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
    A FastAPI dependency that decodes and validates a JWT from the Authorization header.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
        return payload
    except JWTError:
        raise credentials_exception

def is_admin_user(current_user: dict = Depends(get_current_user)):
    """
    A FastAPI dependency to ensure the user has the 'admin' role.
    """
    if current_user.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Operation not permitted: Administrator access required."
        )
    return current_user

# --- General Utilities ---

def load_contract_abi(filepath: str) -> any:
    """
    Loads a JSON ABI from a Hardhat-style artifact file.
    """
    try:
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        full_path = os.path.join(base_dir, filepath)
        
        with open(full_path, 'r') as f:
            artifact = json.load(f)
            if 'abi' not in artifact:
                raise ValueError("The key 'abi' was not found in the artifact file.")
            return artifact['abi']
    except FileNotFoundError:
        raise FileNotFoundError(f"Could not find ABI artifact at the specified path: {full_path}")
    except Exception as e:
        raise RuntimeError(f"An unexpected error occurred while loading the contract ABI: {e}")
