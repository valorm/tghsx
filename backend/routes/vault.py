from flask import Blueprint, jsonify, request
from dependencies import supabase_client
from services.contract_service import get_collateral_vault_contract
from utils.auth import token_required
from web3 import Web3

# Using Flask's Blueprint for routing
vault_routes = Blueprint('vault', __name__)

@vault_routes.route('/save-wallet-address', methods=['POST'])
@token_required
def save_wallet_address(user):
    """
    Endpoint to save or update the wallet address for the authenticated user.
    """
    data = request.get_json()
    wallet_address = data.get('wallet_address')

    if not wallet_address or not Web3.is_address(wallet_address):
        return jsonify({'error': 'A valid wallet_address is required'}), 400

    try:
        user_id = user.id
        # Update the wallet_address for the user's profile in the database
        response = supabase_client.table('profiles').update({'wallet_address': wallet_address}).eq('id', str(user_id)).execute()

        if response.data:
            return jsonify({'message': 'Wallet address updated successfully.'}), 200
        else:
            # Handle cases where the user profile might not exist or an error occurs
            error_message = response.error.message if response.error else "User profile not found or could not be updated."
            return jsonify({'error': error_message}), 404

    except Exception as e:
        return jsonify({'error': 'An internal server error occurred', 'details': str(e)}), 500


@vault_routes.route('/balance/<user_address>', methods=['GET'])
def get_user_balance(user_address):
    """
    Endpoint to get a user's collateral balance and minted tGHSX amount.
    """
    if not Web3.is_address(user_address):
        return jsonify({'error': 'Invalid Ethereum address provided'}), 400
    
    try:
        vault_contract = get_collateral_vault_contract()
        collateral_balance = vault_contract.functions.getCollateralBalance(user_address).call()
        tghsx_minted = vault_contract.functions.vaults(user_address).call()[1]
        
        return jsonify({
            'collateral_balance_wei': str(collateral_balance),
            'tghsx_minted_wei': str(tghsx_minted)
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@vault_routes.route('/health-factor/<user_address>', methods=['GET'])
def get_user_health_factor(user_address):
    """
    Endpoint to get the health factor for a user's vault.
    """
    if not Web3.is_address(user_address):
        return jsonify({'error': 'Invalid Ethereum address provided'}), 400
        
    try:
        vault_contract = get_collateral_vault_contract()
        health_factor = vault_contract.functions.getHealthFactor(user_address).call()
        return jsonify({'health_factor': str(health_factor)})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
