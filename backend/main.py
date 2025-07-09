# In /backend/main.py

from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer

# Import all your route modules
from routes import auth, oracle, vault, mint, transactions, protocol, admin
# --- NEW: Import the liquidations router ---
from routes import liquidations

# --- Initialize FastAPI App ---
app = FastAPI(
    title="tGHSX Backend API",
    description="API for managing tGHSX stablecoin operations.",
    version="1.0.0"
)

# --- CORS Middleware ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Authentication Scheme ---
bearer_scheme = HTTPBearer()

# --- Include All Routers ---
app.include_router(auth.router, prefix="/auth", tags=["Authentication"])
app.include_router(oracle.router, prefix="/oracle", tags=["Oracle"])
app.include_router(mint.router, prefix="/mint", tags=["Minting"])
app.include_router(vault.router, prefix="/vault", tags=["Vault Operations"])
app.include_router(transactions.router, prefix="/transactions", tags=["Transactions"])
app.include_router(protocol.router, prefix="/protocol", tags=["Protocol"])
app.include_router(admin.router, prefix="/admin", tags=["Admin"])
# --- NEW: Include the liquidations router ---
app.include_router(liquidations.router, prefix="/liquidations", tags=["Liquidations"])


# --- Root & Health Endpoints ---
@app.get("/")
async def read_root():
    return {"message": "Welcome to the tGHSX Backend API!"}

@app.get("/health")
async def health_check():
    return {"status": "ok", "message": "Backend is healthy"}
