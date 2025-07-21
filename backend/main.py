# In /backend/main.py

import asyncio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Import all application routers, including the new ones
from routes import auth, oracle, vault, mint, transactions, protocol, admin, liquidations, health, admin_actions
# FIX: Corrected the import from 'task' to 'tasks'
from task import sync_user_vaults

# --- Initialize FastAPI App ---
app = FastAPI(
    title="tGHSX Backend API",
    description="API for managing the tGHSX stablecoin protocol, including vault operations, minting, and administration.",
    version="1.0.2",
    contact={
        "name": "Support",
        "url": "#",
    },
    license_info={
        "name": "MIT",
    },
)

# --- Startup Event Handler ---
@app.on_event("startup")
async def startup_event():
    """
    On application startup, create a background task for syncing user vaults.
    """
    print("Application startup: Starting background task for user vault synchronization...")
    asyncio.create_task(sync_user_vaults())


# --- CORS (Cross-Origin Resource Sharing) Middleware ---
origins = [
    "https://tghsx.vercel.app",

]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- API Routers ---
# Include all the modular router files from the /routes directory.
app.include_router(auth.router, prefix="/auth", tags=["Authentication"])
app.include_router(admin.router, prefix="/admin", tags=["Admin"])
app.include_router(admin_actions.router, prefix="/admin", tags=["Admin Actions"])
app.include_router(mint.router, prefix="/mint", tags=["Minting"])
app.include_router(vault.router, prefix="/vault", tags=["User Vault"])
app.include_router(liquidations.router, prefix="/liquidations", tags=["Liquidations"])
app.include_router(oracle.router, prefix="/oracle", tags=["Price Oracle"])
app.include_router(protocol.router, prefix="/protocol", tags=["Protocol Health"])
app.include_router(transactions.router, prefix="/transactions", tags=["Transaction History"])
app.include_router(health.router, prefix="/health", tags=["Health Checks"])


# --- Root Endpoint ---
@app.get("/", tags=["Root"])
async def read_root():
    """A welcome message for the API root."""
    return {"message": "Welcome to the tGHSX Backend API!"}
