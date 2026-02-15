
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });

export const getAIResponse = async (prompt: string) => {
  try {
    // Upgraded to Pro for Google Search grounding capabilities
    const response = await ai.models.generateContent({
      model: "gemini-1.5-pro",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        systemInstruction: `You are the tGHSX Strategic Advisor, a high-level DeFi intelligence agent. 
        The protocol is a GHS-pegged stablecoin on Polygon.
        
        YOUR CAPABILITIES:
        - Access to real-time market data via Google Search.
        - Deep understanding of the Ghanaian economy (inflation, interest rates, Cedi volatility).
        - Technical DeFi risk assessment (liquidation math, collateral ratios).

        GUIDELINES:
        1. Use Google Search to find CURRENT GHS exchange rates or economic news from Ghana if relevant to the user's risk.
        2. Analyze the user's vaults: Min Ratio 150%, Liquidation 125%.
        3. If a user is near 130%, warn them urgently.
        4. Be precise, technical yet accessible. Use markdown formatting.
        5. Include source links from grounding Metadata if search was used.`
      }
    });

    let text = response.text || "I'm sorry, I couldn't process that request.";
    
    // Extract grounding links if available
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (chunks && chunks.length > 0) {
      text += "\n\n**Sources & Context:**\n";
      const seen = new Set();
      chunks.forEach((chunk: any) => {
        if (chunk.web?.uri && !seen.has(chunk.web.uri)) {
          text += `- [${chunk.web.title || 'Market Source'}](${chunk.web.uri})\n`;
          seen.add(chunk.web.uri);
        }
      });
    }

    return text;
  } catch (error: any) {
    console.error("Gemini Error:", error);
    if (error?.message?.includes("429")) {
      return "Strategic insights are currently limited due to high demand. Your vaults remain safe under the protocol's automated protection.";
    }
    return "Protocol advisory link interrupted. Please check your vault telemetry directly.";
  }
};
