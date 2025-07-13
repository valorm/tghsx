from flask import Blueprint, request, jsonify
from services.supabase_client import supabase_client
from utils.auth import is_admin
import os 

auth_routes = Blueprint('auth', __name__)

@auth_routes.route('/register', methods=['POST'])
def register():
    data = request.get_json()
    email = data.get('email')
    password = data.get('password')
    wallet_address = data.get('wallet_address')

    if not email or not password or not wallet_address:
        return jsonify({'error': 'Email, password, and wallet_address are required'}), 400

    try:
        # Create user in Supabase Auth
        auth_response = supabase_client.auth.sign_up({
            "email": email,
            "password": password
        })

        user_id = auth_response.user.id

        # Insert user profile into 'profiles' table
        profile_data = {
            'user_id': str(user_id), 
            'email': email, 
            'wallet_address': wallet_address,
            'is_admin': False # Default to not admin
        }
        supabase_client.table('profiles').insert(profile_data).execute()

        return jsonify({
            'message': 'User registered successfully. Please check your email to verify.',
            'user_id': user_id
        }), 201

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@auth_routes.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    email = data.get('email')
    password = data.get('password')

    if not email or not password:
        return jsonify({'error': 'Email and password are required'}), 400

    try:
        response = supabase_client.auth.sign_in_with_password({
            "email": email,
            "password": password
        })
        return jsonify({
            'message': 'Login successful',
            'access_token': response.session.access_token,
            'user_id': response.user.id
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 401

@auth_routes.route('/admin-login', methods=['POST'])
def admin_login():
    data = request.get_json()
    email = data.get('email')
    password = data.get('password')

    if not email or not password:
        return jsonify({'error': 'Email and password are required'}), 400

    try:
        response = supabase_client.auth.sign_in_with_password({
            "email": email,
            "password": password
        })
        
        user_id = response.user.id
        
        if not is_admin(user_id):
            return jsonify({'error': 'Invalid credentials or not an admin'}), 403

        return jsonify({
            'message': 'Admin login successful',
            'access_token': response.session.access_token,
            'user_id': user_id
        }), 200

    except Exception as e:
        return jsonify({'error': 'Invalid credentials or not an admin'}), 401

@auth_routes.route('/logout', methods=['POST'])
def logout():
    try:
        supabase_client.auth.sign_out()
        return jsonify({'message': 'Successfully logged out'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
