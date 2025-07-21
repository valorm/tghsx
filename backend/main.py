# In /backend/main.py

import asyncio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi_cache import FastAPICache
from fastapi_cache.backends.inmemory import InMemoryBackend

# Import all application routers
from routes import auth, oracle, vault, mint, transactions, protocol, admin, liquidations, health, collateral

# Import the background task
from task import sync_user_vaults

# --- Initialize FastAPI App ---
app = FastAPI(
    title="tGHSX Backend API",
    description="API for managing the tGHSX stablecoin protocol, including vault operations, minting, and administration.",
    version="1.1.1", # Incremented version
)

# --- Startup Event Handler ---
@app.on_event("startup")
async def startup_event():
    FastAPICache.init(InMemoryBackend(), prefix="fastapi-cache")
    print("FastAPI cache initialized with in-memory backend.")
    
    print("Starting background task for user vault synchronization...")
    asyncio.create_task(sync_user_vaults())

# --- CORS Middleware ---
origins = [
    "https://tghsx.vercel.app",
    "http://localhost",
    "http://localhost:8080",
    "http://localhost:3000",
    "http://127.0.0.1:5500" 
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- API Routers ---
app.include_router(auth.router, prefix="/auth", tags=["Authentication"])
app.include_router(admin.router, prefix="/admin", tags=["Admin"])
app.include_router(mint.router, prefix="/mint", tags=["Minting"])
app.include_router(vault.router, prefix="/vault", tags=["User Vault"])
app.include_router(liquidations.router, prefix="/liquidations", tags=["Liquidations"])
app.include_router(oracle.router, prefix="/oracle", tags=["Price Oracle"])
app.include_router(protocol.router, prefix="/protocol", tags=["Protocol Health"])
# FIX: Changed prefix to "/" to match the deployed frontend's request URL
app.include_router(collateral.router, prefix="", tags=["Collaterals"])
app.include_router(transactions.router, prefix="/transactions", tags=["Transaction History"])
app.include_router(health.router, prefix="/health", tags=["Health Checks"])

# --- Root Endpoint ---
@app.get("/", tags=["Root"])
async def read_root():
    """A welcome message for the API root."""
    return {"message": "Welcome to the tGHSX Backend API!"}
