from flask import Blueprint, request, jsonify
from dependencies import supabase_client
from utils.auth import token_required

# Using Flask's Blueprint for routing
mint_routes = Blueprint('mint', __name__)

@mint_routes.route('/request', methods=['POST'])
@token_required
def request_mint(user): # The 'user' object is passed from the token_required decorator
    """
    Endpoint for a user to submit a request to mint tGHSX.
    """
    data = request.get_json()
    collateral_amount = data.get('collateral_amount')
    mint_amount = data.get('mint_amount')
    collateral_ratio = data.get('collateral_ratio')

    if not all([collateral_amount, mint_amount]):
        return jsonify({"error": "collateral_amount and mint_amount are required"}), 400

    try:
        # Insert the mint request into the database
        insert_response = supabase_client.table('mint_requests').insert({
            'user_id': str(user.id),
            'collateral_amount': collateral_amount,
            'mint_amount': mint_amount,
            'collateral_ratio': collateral_ratio,
            'status': 'pending'
        }).execute()

        if insert_response.data:
            return jsonify(insert_response.data[0]), 201
        else:
            error_message = insert_response.error.message if insert_response.error else "Unknown error"
            return jsonify({"error": "Failed to create mint request", "details": error_message}), 500

    except Exception as e:
        return jsonify({"error": "An internal error occurred", "details": str(e)}), 500
