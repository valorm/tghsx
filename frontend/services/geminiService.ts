export const getAIResponse = async (prompt: string) => {
  try {
    const response = await fetch('/api/ai/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    });

    if (!response.ok) {
      throw new Error(`AI request failed with status ${response.status}`);
    }

    const data = await response.json();
    const modelText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    let text = modelText || "I'm sorry, I couldn't process that request.";

    const chunks = data?.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (chunks && chunks.length > 0) {
      text += '\n\n**Sources & Context:**\n';
      const seen = new Set<string>();
      chunks.forEach((chunk: any) => {
        if (chunk.web?.uri && !seen.has(chunk.web.uri)) {
          text += `- [${chunk.web.title || 'Market Source'}](${chunk.web.uri})\n`;
          seen.add(chunk.web.uri);
        }
      });
    }

    return text;
  } catch (error: any) {
    console.error('AI Service Error:', error);
    if (error?.message?.includes('429')) {
      return 'Strategic insights are currently limited due to high demand. Your vaults remain safe under the protocol\'s automated protection.';
    }
    return 'Protocol advisory link interrupted. Please check your vault telemetry directly.';
  }
};
