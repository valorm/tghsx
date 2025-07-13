from flask import Blueprint, jsonify
from dependencies import supabase_client
from services.contract_service import get_collateral_vault_contract
from web3 import Web3

# Using Flask's Blueprint for routing
liquidations_routes = Blueprint('liquidations', __name__)

@liquidations_routes.route('/at-risk-vaults', methods=['GET'])
def get_at_risk_vaults():
    """
    Endpoint to find vaults that are below the collateralization ratio and at risk of liquidation.
    """
    try:
        vault_contract = get_collateral_vault_contract()
        # This is inefficient and should be improved later with an off-chain worker.
        profiles_response = supabase_client.table('profiles').select('wallet_address').execute()

        if not profiles_response.data:
            return jsonify([])

        at_risk_vaults = []
        for profile in profiles_response.data:
            wallet_address = profile.get('wallet_address')
            if wallet_address and Web3.is_address(wallet_address):
                try:
                    health_factor = vault_contract.functions.getHealthFactor(wallet_address).call()
                    # A health factor below 1 (represented as 1 * 10**18) is considered at risk.
                    if health_factor < 10**18:
                        at_risk_vaults.append({
                            "wallet_address": wallet_address,
                            "health_factor": str(health_factor)
                        })
                except Exception as e:
                    # Log and ignore errors for individual vault checks to not fail the whole request
                    print(f"Could not check health factor for {wallet_address}: {e}")
        
        return jsonify(at_risk_vaults)

    except Exception as e:
        return jsonify({'error': "Failed to fetch at-risk vaults", 'details': str(e)}), 500
