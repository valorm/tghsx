#!/bin/bash

# ==============================================================================
# Full Deployment & Backend Startup Script (v2 - with Clean Install)
#
# This script automates the entire process:
# 1. Cleans and reinstalls all Node.js dependencies to prevent caching issues.
# 2. Cleans and compiles the Hardhat project.
# 3. Deploys all contracts using the deploy_all.js script.
# 4. Verifies the contracts on Polygon Amoy Scan.
# 5. Starts the Python backend server.
#
# Usage:
# 1. Make the script executable: chmod +x full_deploy.sh
# 2. Run the script: ./full_deploy.sh
# ==============================================================================

# Exit immediately if a command exits with a non-zero status.
set -e

# --- Step 3: Deploy and Verify Contracts ---
echo "--- Step 3: Deploying to Polygon Amoy Testnet & Verifying ---"
# The deploy_all.js script now handles both deployment and verification.
# Ensure your hardhat.config.js is configured for the 'amoy' network.
npx hardhat run scripts/deploy_all.js --network amoy
echo "✅ Deployment and verification script finished."
echo ""

# --- Step 4: Start the Backend Server ---
echo "--- Step 4: Starting the Backend Server ---"
# Navigate to the backend directory
cd backend

# Check if requirements are installed, if not, install them
if [ -f "requirements.txt" ]; then
    echo "Installing/updating Python dependencies..."
    pip install -r requirements.txt
    echo "✅ Python dependencies are up to date."
else
    echo "⚠️ Warning: requirements.txt not found. Skipping dependency installation."
fi

# Start the Uvicorn server
echo "🚀 Starting FastAPI backend on http://127.0.0.1:8000"
uvicorn main:app --host 0.0.0.0 --port 8000 --reload

echo ""
echo "Backend server has been started."
