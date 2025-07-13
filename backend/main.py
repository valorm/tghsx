from flask import Flask, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
import os

# Load environment variables from .env file
load_dotenv()

# Import all the route blueprints from the routes package
from routes.auth import auth_routes
from routes.oracle import oracle_routes
from routes.vault import vault_routes
from routes.mint import mint_routes
from routes.transactions import transactions_routes
from routes.protocol import protocol_routes
from routes.admin import admin_routes
from routes.liquidations import liquidations_routes

# Initialize the Flask application
app = Flask(__name__)

# Setup Cross-Origin Resource Sharing (CORS) for the entire app.
# This is a more permissive setting that will allow your frontend
# to communicate with all backend endpoints.
CORS(app)

# Register all the blueprints with the Flask app, defining their URL prefixes
app.register_blueprint(auth_routes, url_prefix='/api/v1/auth')
app.register_blueprint(oracle_routes, url_prefix='/api/v1/oracle')
app.register_blueprint(vault_routes, url_prefix='/api/v1/vault')
app.register_blueprint(mint_routes, url_prefix='/api/v1/mint')
app.register_blueprint(transactions_routes, url_prefix='/api/v1/transactions')
app.register_blueprint(protocol_routes, url_prefix='/api/v1/protocol')
app.register_blueprint(admin_routes, url_prefix='/api/v1/admin')
app.register_blueprint(liquidations_routes, url_prefix='/api/v1/liquidations')

@app.route("/")
def read_root():
    """
    A simple root endpoint to confirm the API is running.
    """
    return jsonify({"message": "Welcome to the tGHSX Protocol API (Flask Version)"})

# This block is for running the app locally for development.
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    app.run(host="0.0.0.0", port=port)
