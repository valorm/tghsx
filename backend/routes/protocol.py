from flask import Blueprint, jsonify, request
import os

protocol_routes = Blueprint('protocol', __name__)

# A dictionary to hold contract names and their corresponding environment variable keys
CONTRACT_ADDRESS_KEYS = {
    "CollateralVault": "COLLATERAL_VAULT_ADDRESS",
    "TGHSXToken": "TGHSX_TOKEN_ADDRESS",
}

@protocol_routes.route('/contract-address', methods=['GET'])
def get_contract_address():
    """
    Returns the address of a requested contract.
    e.g., /api/v1/protocol/contract-address?name=CollateralVault
    """
    contract_name = request.args.get('name')
    if not contract_name:
        return jsonify({"error": "Contract name parameter is required."}), 400

    env_var_key = CONTRACT_ADDRESS_KEYS.get(contract_name)
    if not env_var_key:
        return jsonify({"error": f"Contract '{contract_name}' is not a known contract."}), 404

    address = os.getenv(env_var_key)
    if not address:
        return jsonify({"error": f"Address for contract '{contract_name}' not configured on the server."}), 500
        
    return jsonify({"name": contract_name, "address": address})

@protocol_routes.route('/info', methods=['GET'])
def get_protocol_info():
    """
    Returns general information about the protocol.
    """
    return jsonify({
        "name": "tGHSX Protocol",
        "version": "1.0.0",
        "description": "A decentralized synthetic asset protocol.",
        "network_id": os.getenv("NETWORK_ID", "N/A"),
    })
