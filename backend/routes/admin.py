from flask import Blueprint, request, jsonify
from dependencies import w3, supabase_client
from services.contract_service import get_collateral_vault_contract, get_tghsx_token_contract
from services.oracle_service import get_price_from_oracle, update_price_in_oracle
from utils.auth import admin_required

admin_routes = Blueprint('admin', __name__)

@admin_routes.route('/status', methods=['GET'])
@admin_required
def get_protocol_status(user_id):
    """
    New endpoint to provide a status/statistics overview for the admin panel.
    This matches the frontend's request to /api/v1/admin/status.
    """
    try:
        collateral_vault = get_collateral_vault_contract()
        total_collateral = collateral_vault.functions.totalCollateral().call()
        
        tghsx_token = get_tghsx_token_contract()
        total_supply = tghsx_token.functions.totalSupply().call()
        
        return jsonify({
            'total_collateral_wei': total_collateral,
            'total_tghsx_supply_wei': total_supply,
            'status': 'ok'
        }), 200
    except Exception as e:
        return jsonify({'error': str(e), 'status': 'error'}), 500

@admin_routes.route('/protocol-stats', methods=['GET'])
@admin_required
def get_protocol_stats(user_id):
    """
    This is an alias for the new /status endpoint for any older references.
    """
    return get_protocol_status(user_id)


@admin_routes.route('/user-balances', methods=['GET'])
@admin_required
def get_user_balances(user_id):
    try:
        users = supabase_client.table('profiles').select('wallet_address').execute()
        balances = []
        collateral_vault = get_collateral_vault_contract()
        tghsx_token = get_tghsx_token_contract()

        for user in users.data:
            address = user['wallet_address']
            if not address: continue
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
        tx_hash = update_price_in_oracle(int(new_price))
        return jsonify({'message': 'Oracle price updated', 'tx_hash': tx_hash}), 200
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
        updated_user = supabase_client.table('profiles').update({'is_admin': True}).eq('id', target_user_id).execute()
        
        if not updated_user.data:
            return jsonify({'error': 'User not found or could not be updated.'}), 404

        return jsonify({'message': f'Admin role granted to user {target_user_id}'}), 200
    except Exception as e:
        return jsonify({'error': 'An error occurred', 'details': str(e)}), 500
