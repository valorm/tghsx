from flask import Blueprint, request, jsonify
from services.web3_service import w3
from services.contract_service import get_collateral_vault_contract, get_tghsx_token_contract
from services.oracle_service import get_price_from_oracle, update_price_in_oracle
from services.supabase_client import get_supabase_admin_client
from utils.auth import admin_required

admin_routes = Blueprint('admin', __name__)

@admin_routes.route('/protocol-stats', methods=['GET'])
@admin_required
def get_protocol_stats(user_id):
    try:
        collateral_vault = get_collateral_vault_contract()
        total_collateral = collateral_vault.functions.totalCollateral().call()
        
        tghsx_token = get_tghsx_token_contract()
        total_supply = tghsx_token.functions.totalSupply().call()
        
        return jsonify({
            'total_collateral_wei': total_collateral,
            'total_tghsx_supply_wei': total_supply
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@admin_routes.route('/user-balances', methods=['GET'])
@admin_required
def get_user_balances(user_id):
    try:
        supabase_admin = get_supabase_admin_client()
        users = supabase_admin.table('profiles').select('wallet_address').execute()
        balances = []
        collateral_vault = get_collateral_vault_contract()
        tghsx_token = get_tghsx_token_contract()

        for user in users.data:
            address = user['wallet_address']
            collateral_balance = collateral_vault.functions.getCollateralBalance(address).call()
            tghsx_balance = tghsx_token.functions.balanceOf(address).call()
            balances.append({
                'address': address,
                'collateral_wei': collateral_balance,
                'tghsx_wei': tghsx_balance
            })
        return jsonify(balances), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@admin_routes.route('/update-oracle', methods=['POST'])
@admin_required
def update_oracle(user_id):
    data = request.get_json()
    new_price = data.get('price')
    if not new_price:
        return jsonify({'error': 'Price is required'}), 400
    
    try:
        tx_hash = update_price_in_oracle(new_price)
        return jsonify({'message': 'Oracle price updated', 'tx_hash': tx_hash}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@admin_routes.route('/mint-tghsx', methods=['POST'])
@admin_required
def mint_tghsx_for_user(user_id):
    data = request.get_json()
    user_address = data.get('user_address')
    amount = data.get('amount')

    if not user_address or not amount:
        return jsonify({'error': 'User address and amount are required'}), 400

    try:
        tghsx_token = get_tghsx_token_contract()
        tx = tghsx_token.functions.mint(user_address, w3.to_wei(amount, 'ether')).transact({'from': w3.eth.default_account})
        tx_receipt = w3.eth.wait_for_transaction_receipt(tx)
        return jsonify({'message': 'TGHSX minted successfully', 'tx_hash': tx_receipt.transactionHash.hex()}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@admin_routes.route('/burn-tghsx', methods=['POST'])
@admin_required
def burn_tghsx_for_user(user_id):
    data = request.get_json()
    user_address = data.get('user_address')
    amount = data.get('amount')

    if not user_address or not amount:
        return jsonify({'error': 'User address and amount are required'}), 400

    try:
        tghsx_token = get_tghsx_token_contract()
        tx = tghsx_token.functions.burnFrom(user_address, w3.to_wei(amount, 'ether')).transact({'from': w3.eth.default_account})
        tx_receipt = w3.eth.wait_for_transaction_receipt(tx)
        return jsonify({'message': 'TGHSX burned successfully', 'tx_hash': tx_receipt.transactionHash.hex()}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@admin_routes.route('/grant-admin-role', methods=['POST'])
@admin_required
def grant_admin_role(user_id):
    data = request.get_json()
    target_user_id = data.get('user_id')

    if not target_user_id:
        return jsonify({'error': 'Target user_id is required'}), 400

    try:
        supabase_admin = get_supabase_admin_client()
        updated_user = supabase_admin.table('profiles').update({'is_admin': True}).eq('user_id', target_user_id).execute()
        
        if not updated_user.data:
            return jsonify({'error': 'User not found or could not be updated.'}), 404

        return jsonify({'message': f'Admin role granted to user {target_user_id}'}), 200
    except Exception as e:
        return jsonify({'error': 'An error occurred', 'details': str(e)}), 500