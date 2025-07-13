from flask import Blueprint, jsonify
from services.oracle_service import get_price_from_oracle

# Using Flask's Blueprint for routing
oracle_routes = Blueprint('oracle', __name__)

@oracle_routes.route('/price', methods=['GET'])
def get_price():
    """
    Endpoint to get the latest price from the Chainlink oracle.
    """
    try:
        # Fetch price from the oracle service
        price, decimals = get_price_from_oracle()
        # Return the price as a JSON response
        return jsonify({
            'price': str(price),
            'decimals': decimals
        })
    except Exception as e:
        # Handle potential errors and return a 500 status code
        return jsonify({'error': f"An error occurred while fetching the price: {str(e)}"}), 500
