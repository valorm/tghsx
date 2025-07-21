# In /backend/main.py

import asyncio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import logging

# --- Setup Logging ---
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

logger.info("Starting main.py: Loading modules...")

try:
    # FIX: Removed admin_actions from this import list
    from routes import auth, oracle, vault, mint, transactions, protocol, admin, liquidations, health
    from task import sync_user_vaults
    logger.info("Successfully imported all routes and tasks.")
except ImportError as e:
    logger.critical(f"Failed to import a module. This is a critical error. Details: {e}")


# --- Initialize FastAPI App ---
app = FastAPI(
    title="tGHSX Backend API",
    description="API for managing the tGHSX stablecoin protocol.",
    version="1.0.4",
)

# --- Startup Event Handler ---
@app.on_event("startup")
async def startup_event():
    logger.info("Application startup: Starting background task for user vault synchronization...")
    asyncio.create_task(sync_user_vaults())


# --- CORS Middleware ---
origins = [
    "https://tghsx.vercel.app",
    "http://localhost",
    "http://localhost:3000",
    "http://localhost:8080",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
logger.info("CORS middleware configured.")

# --- API Routers ---
try:
    logger.info("Including API routers...")
    app.include_router(auth.router, prefix="/auth", tags=["Authentication"])
    app.include_router(admin.router, prefix="/admin", tags=["Admin"]) # This now includes admin actions
    app.include_router(mint.router, prefix="/mint", tags=["Minting"])
    app.include_router(vault.router, prefix="/vault", tags=["User Vault"])
    app.include_router(liquidations.router, prefix="/liquidations", tags=["Liquidations"])
    app.include_router(oracle.router, prefix="/oracle", tags=["Price Oracle"])
    app.include_router(protocol.router, prefix="/protocol", tags=["Protocol Health"])
    app.include_router(transactions.router, prefix="/transactions", tags=["Transaction History"])
    app.include_router(health.router, prefix="/health", tags=["Health Checks"])
    logger.info("All API routers included successfully.")
except Exception as e:
    logger.critical(f"Failed to include a router. This is a critical error. Details: {e}")


# --- Root Endpoint ---
@app.get("/", tags=["Root"])
async def read_root():
    return {"message": "Welcome to the tGHSX Backend API!"}

logger.info("main.py loaded successfully. Application is ready to be served.")
