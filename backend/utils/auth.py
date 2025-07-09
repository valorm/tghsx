# In /backend/utils/auth.py

import os
from fastapi import Header, HTTPException, Depends
import base64
import json

def get_current_user_id_from_token(authorization: str = Header(...)) -> str:
    """
    Decodes the Supabase JWT from the Authorization header to extract the user's ID (sub).
    
    This is a more realistic implementation, though for production, a proper
    JWT validation library (like python-jose) with secret key verification is recommended.
    """
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization scheme.")
    
    token = authorization.split(" ")[1]
    
    # A JWT is composed of three parts: header.payload.signature
    # We need to decode the payload (the middle part)
    try:
        payload_base64 = token.split('.')[1]
        
        # The payload is Base64Url encoded, which needs padding to be decoded.
        # Add padding ('=') if the length is not a multiple of 4.
        payload_base64 += '=' * (-len(payload_base64) % 4)
        
        # Decode the Base64 string and then parse it as JSON
        decoded_payload = base64.b64decode(payload_base64).decode('utf-8')
        payload_json = json.loads(decoded_payload)
        
        # The user's ID is stored in the 'sub' (subject) claim of the JWT
        user_id = payload_json.get("sub")
        
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token: 'sub' claim not found.")
            
        return user_id
        
    except (IndexError, base64.binascii.Error, json.JSONDecodeError) as e:
        # This catches errors from malformed tokens
        raise HTTPException(status_code=401, detail=f"Invalid token format: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred during token processing: {e}")


def is_admin(user_id: str = Depends(get_current_user_id_from_token)):
    """
    A simple dependency to check if the current user is the designated admin.
    """
    ADMIN_USER_ID = os.getenv("ADMIN_USER_ID")
    if not ADMIN_USER_ID:
        raise HTTPException(status_code=500, detail="Admin user not configured on the server.")
    if user_id != ADMIN_USER_ID:
        raise HTTPException(status_code=403, detail="Forbidden: Admin access required.")
    return user_id