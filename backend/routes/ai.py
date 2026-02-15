import os

import httpx
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

router = APIRouter()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent"


class AIQueryRequest(BaseModel):
    prompt: str


@router.post("/query")
async def query_ai(request: AIQueryRequest):
    """Proxy endpoint for Gemini AI queries to keep API keys server-side."""
    if not GEMINI_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Gemini API key is not configured on the server.",
        )

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                GEMINI_URL,
                headers={
                    "Content-Type": "application/json",
                    "x-goog-api-key": GEMINI_API_KEY,
                },
                json={
                    "contents": [{"parts": [{"text": request.prompt}]}],
                    "tools": [{"googleSearch": {}}],
                    "system_instruction": {
                        "parts": [
                            {
                                "text": (
                                    "You are the tGHSX Strategic Advisor, a high-level DeFi intelligence agent. "
                                    "The protocol is a GHS-pegged stablecoin on Polygon.\n\n"
                                    "YOUR CAPABILITIES:\n"
                                    "- Access to real-time market data via Google Search.\n"
                                    "- Deep understanding of the Ghanaian economy (inflation, interest rates, Cedi volatility).\n"
                                    "- Technical DeFi risk assessment (liquidation math, collateral ratios).\n\n"
                                    "GUIDELINES:\n"
                                    "1. Use Google Search to find CURRENT GHS exchange rates or economic news from Ghana if relevant to the user's risk.\n"
                                    "2. Analyze the user's vaults: Min Ratio 150%, Liquidation 125%.\n"
                                    "3. If a user is near 130%, warn them urgently.\n"
                                    "4. Be precise, technical yet accessible. Use markdown formatting.\n"
                                    "5. Include source links from grounding metadata if search was used."
                                )
                            }
                        ]
                    },
                },
            )
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as exc:
        detail = exc.response.text or "Gemini API request failed"
        raise HTTPException(status_code=exc.response.status_code, detail=detail) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to query AI service: {str(exc)}",
        ) from exc
