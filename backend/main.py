# In /backend/main.py

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Import all application routers
from routes import auth, oracle, vault, mint, transactions, protocol, admin, liquidations

# --- Initialize FastAPI App ---
app = FastAPI(
    title="tGHSX Backend API",
    description="API for managing the tGHSX stablecoin protocol, including vault operations, minting, and administration.",
    version="1.0.1",
    contact={
        "name": "Support",
        "url": "#",
    },
    license_info={
        "name": "MIT",
    },
)

# --- CORS (Cross-Origin Resource Sharing) Middleware ---
# FIX: Explicitly list the frontend origin to resolve the CORS error.
# Using a wildcard ("*") is not allowed when `allow_credentials=True`.
origins = [
    "https://tghsx.vercel.app",
    "http://localhost",
    "http://localhost:8080",
    "http://127.0.0.1:5500" 
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods (GET, POST, etc.)
    allow_headers=["*"],  # Allows all headers
)

# --- API Routers ---
# Include all the modular router files from the /routes directory.
app.include_router(auth.router, prefix="/auth", tags=["Authentication"])
app.include_router(admin.router, prefix="/admin", tags=["Admin"])
app.include_router(mint.router, prefix="/mint", tags=["Minting"])
app.include_router(vault.router, prefix="/vault", tags=["User Vault"])
app.include_router(liquidations.router, prefix="/liquidations", tags=["Liquidations"])
app.include_router(oracle.router, prefix="/oracle", tags=["Price Oracle"])
app.include_router(protocol.router, prefix="/protocol", tags=["Protocol Health"])
app.include_router(transactions.router, prefix="/transactions", tags=["Transaction History"])


# --- Root & Health Check Endpoints ---
@app.get("/", tags=["Root"])
async def read_root():
    """A welcome message for the API root."""
    return {"message": "Welcome to the tGHSX Backend API!"}

@app.get("/health", tags=["Health"])
async def health_check():
    """A simple health check endpoint to confirm the API is running."""
    return {"status": "ok", "message": "API is healthy and running."}
