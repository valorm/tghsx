from flask import Blueprint, jsonify
from services.contract_service import get_collateral_vault_contract
from web3 import Web3

# Using Flask's Blueprint for routing
vault_routes = Blueprint('vault', __name__)

@vault_routes.route('/balance/<user_address>', methods=['GET'])
def get_user_balance(user_address):
    """
    Endpoint to get a user's collateral balance and minted tGHSX amount.
    """
    if not Web3.is_address(user_address):
        return jsonify({'error': 'Invalid Ethereum address provided'}), 400
    
    try:
        vault_contract = get_collateral_vault_contract()
        # Fetch collateral balance from the smart contract
        collateral_balance = vault_contract.functions.getCollateralBalance(user_address).call()
        # Fetch the amount of tGHSX the user has minted
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
        # Fetch health factor from the smart contract
        health_factor = vault_contract.functions.getHealthFactor(user_address).call()
        return jsonify({'health_factor': str(health_factor)})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
