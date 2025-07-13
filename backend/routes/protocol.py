from flask import Blueprint, jsonify
from dependencies import supabase_client
from utils.auth import token_required

# Using Flask's Blueprint for routing
transactions_routes = Blueprint('transactions', __name__)

@transactions_routes.route('/history', methods=['GET'])
@token_required
def get_transaction_history(user): # The 'user' object is passed from the token_required decorator
    """
    Endpoint to fetch the transaction history for the authenticated user.
    """
    try:
        # Fetch transactions from the database for the given user ID
        response = supabase_client.table('transactions').select('*').eq('user_id', str(user.id)).execute()

        if response.data:
            return jsonify(response.data)
        elif response.error:
            return jsonify({"error": "Failed to fetch transactions", "details": response.error.message}), 500
        else:
            # Return an empty list if there are no transactions
            return jsonify([])

    except Exception as e:
        return jsonify({"error": "An internal error occurred", "details": str(e)}), 500
