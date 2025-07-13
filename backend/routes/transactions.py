from flask import Blueprint, jsonify
from dependencies import supabase_client
from utils.auth import token_required

# Using Flask's Blueprint for routing, converted from FastAPI
transactions_routes = Blueprint('transactions', __name__)

@transactions_routes.route('/history', methods=['GET'])
@token_required
def get_transaction_history(user): # The 'user' object is passed from the @token_required decorator
    """
    Endpoint to fetch the transaction history for the authenticated user.
    """
    if not supabase_client:
        return jsonify({"error": "Database connection not available"}), 503

    try:
        # Fetch transactions from the database for the current user's ID
        user_id = user.id
        response = supabase_client.table('transactions').select('*').eq('user_id', str(user_id)).execute()

        if response.data:
            return jsonify(response.data)
        elif response.error:
            # If Supabase returns an error, log it and inform the client
            print(f"ERROR: Supabase error fetching transactions: {response.error.message}")
            return jsonify({"error": "Failed to fetch transactions", "details": response.error.message}), 500
        else:
            # Return an empty list if there are no transactions for the user
            return jsonify([])

    except Exception as e:
        # Catch any other unexpected errors
        print(f"ERROR: Internal error fetching transaction history: {e}")
        return jsonify({"error": "An internal server error occurred", "details": str(e)}), 500
