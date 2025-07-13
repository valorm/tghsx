from functools import wraps
from flask import request, jsonify
from dependencies import supabase_client
import os

def token_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        auth_header = request.headers.get('Authorization')
        if not auth_header:
            return jsonify({'error': 'Authorization header missing'}), 401
        
        try:
            token = auth_header.split(" ")[1]
            user_response = supabase_client.auth.get_user(token)
            # Add user object to the request context
            kwargs['user'] = user_response.user
        except Exception as e:
            return jsonify({'error': 'Invalid token or user not found', 'details': str(e)}), 401
        
        return f(*args, **kwargs)
    return decorated_function

def is_admin(user_id):
    """
    Checks if a user has the admin role by checking the 'is_admin' flag in their profile.
    It queries the 'id' column which is the primary key and foreign key to auth.users.
    """
    if not user_id:
        return False
    try:
        # Correctly query using the 'id' column from the profiles table
        profile = supabase_client.table('profiles').select('is_admin').eq('id', str(user_id)).single().execute()
        if profile.data and profile.data.get('is_admin'):
            return True
        return False
    except Exception as e:
        # It's good practice to log the actual error for debugging.
        print(f"Error checking admin status for user {user_id}: {e}")
        return False

def admin_required(f):
    """
    A decorator to protect routes that require admin privileges.
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        auth_header = request.headers.get('Authorization')
        if not auth_header:
            return jsonify({'error': 'Authorization header missing'}), 401
        
        try:
            token = auth_header.split(" ")[1]
            user_response = supabase_client.auth.get_user(token)
            user_id = user_response.user.id
            
            if not is_admin(user_id):
                return jsonify({'error': 'Admin access required'}), 403
            
            # Pass the user_id to the decorated function
            kwargs['user_id'] = user_id

        except Exception as e:
            return jsonify({'error': 'Invalid token or authentication error', 'details': str(e)}), 401
        
        return f(*args, **kwargs)
    return decorated_function
