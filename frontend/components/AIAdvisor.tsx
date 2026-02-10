
import React, { useState, useRef, useEffect } from 'react';
import { getAIResponse } from '../services/geminiService';
import { UserPosition, ChatMessage, CollateralType, Transaction } from '../types';
import { SYSTEM_PARAMS } from '../constants';

interface AIAdvisorProps {
  positions: UserPosition[];
  prices: Record<CollateralType, number>;
  transactions: Transaction[];
}

const AIAdvisor: React.FC<AIAdvisorProps> = ({ positions, prices, transactions }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'model', text: "Strategic Intelligence Link Established. I'm currently monitoring global GHS stability and Polygon Amoy ledger events. How can I optimize your capital today?" }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [researching, setResearching] = useState<boolean>(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const suggestedPrompts = [
    "Assess liquidation risk at current prices",
    "What happens if GHS weakens 20%?",
    "Is my buffer sufficient for current volatility?",
    "Review recent GHS inflation trends"
  ];

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = async (e?: React.FormEvent, customPrompt?: string) => {
    if (e) e.preventDefault();
    const userMsg = customPrompt || input;
    if (!userMsg.trim() || loading) return;

    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setLoading(true);
    setResearching(true);

    const contextPrompt = `
      PROTOCOL LIVE TELEMETRY:
      - Current GHS Market Index: ${JSON.stringify(prices)}
      - Protocol Parameters: Min Ratio ${SYSTEM_PARAMS.MIN_COLLATERAL_RATIO}%, Liquidation ${SYSTEM_PARAMS.LIQUIDATION_THRESHOLD}%
      - User Active Positions: ${JSON.stringify(positions.map(p => ({
        asset: p.collateralType,
        debt: p.mintedDebt,
        health: p.healthFactor.toFixed(2)
      })))}
      - Recent Local Events: ${JSON.stringify(transactions.slice(0, 2))}
      
      USER QUERY: ${userMsg}
      
      INSTRUCTION: If necessary, use your search tools to find current events from Ghana or macro DeFi trends that might affect these assets.
    `;

    try {
      const aiMsg = await getAIResponse(contextPrompt);
      setMessages(prev => [...prev, { role: 'model', text: aiMsg }]);
    } finally {
      setLoading(false);
      setResearching(false);
    }
  };

  return (
    <div className="glass-morphism rounded-[2.5rem] flex flex-col h-[calc(100vh-14rem)] border border-white/5 shadow-2xl animate-in fade-in slide-in-from-bottom-8 overflow-hidden">
      {/* Header with active research status and softened reliability claim */}
      <div className="p-8 border-b border-white/5 bg-white/[0.02] flex items-center justify-between">
        <div className="flex items-center gap-5">
          <div className="relative">
            <div className="w-14 h-14 rounded-[1.25rem] bg-gradient-to-tr from-indigo-500 to-violet-600 flex items-center justify-center text-2xl shadow-lg border border-white/10">🧠</div>
            <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 border-4 border-[#020617] rounded-full shadow-[0_0_10px_#10b981]"></div>
          </div>
          <div>
            <h3 className="font-black text-xl text-white tracking-tight leading-none">Strategic Intelligence</h3>
            <p className="text-[10px] text-indigo-400 font-black uppercase tracking-widest mt-2 flex items-center gap-2">
              <span className={`w-1.5 h-1.5 rounded-full ${researching ? 'bg-indigo-500 animate-pulse' : 'bg-slate-600'}`}></span>
              {researching ? 'Live Grounding Active' : 'Real-time Telemetry Linked'}
            </p>
            {/* Added explicit hard disclaimer */}
            <p className="text-[8px] text-slate-500 font-bold uppercase tracking-widest mt-1 opacity-60">
              Advisory only. This system cannot execute transactions or guarantee outcomes.
            </p>
          </div>
        </div>
        <div className="hidden lg:flex gap-8">
           <div className="text-right">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Global Feeds</p>
              <p className="text-xs font-bold text-emerald-400 font-mono">Index accuracy: monitored</p>
           </div>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-10 space-y-10 scroll-smooth scrollbar-hide">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] px-8 py-6 rounded-[2rem] shadow-2xl relative ${
              msg.role === 'user' 
                ? 'bg-indigo-600 text-white rounded-tr-none' 
                : 'bg-slate-900/60 text-slate-200 rounded-tl-none border border-white/10 backdrop-blur-md'
            }`}>
              <div className="text-sm leading-relaxed font-medium whitespace-pre-wrap">
                {msg.text}
              </div>
            </div>
          </div>
        ))}
        
        {/* Suggested Prompt Chips for new users/conversations */}
        {messages.length === 1 && !loading && (
          <div className="flex flex-wrap gap-3 mt-4 animate-in fade-in slide-in-from-left-4 duration-700">
            {suggestedPrompts.map((prompt, idx) => (
              <button
                key={idx}
                onClick={() => handleSubmit(undefined, prompt)}
                className="px-5 py-3 bg-white/5 border border-white/10 rounded-2xl text-[10px] font-black text-slate-400 uppercase tracking-wider hover:bg-white/10 hover:text-white hover:border-indigo-500/30 transition-all active:scale-95"
              >
                {prompt}
              </button>
            ))}
          </div>
        )}

        {loading && (
          <div className="flex flex-col gap-3">
             <div className="flex justify-start">
               <div className="bg-slate-900/80 border border-white/10 px-6 py-5 rounded-[2rem] rounded-tl-none flex items-center gap-3">
                 <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce [animation-duration:0.8s]"></div>
                 <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce [animation-duration:0.8s] [animation-delay:0.2s]"></div>
                 <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce [animation-duration:0.8s] [animation-delay:0.4s]"></div>
               </div>
             </div>
             {researching && (
               <p className="text-[9px] font-black text-indigo-400 uppercase tracking-[0.2em] ml-6 animate-pulse">
                 Consulting Market News & Economic Indices...
               </p>
             )}
          </div>
        )}
      </div>

      {/* Input Zone with terminal feel */}
      <div className="p-8 border-t border-white/5 bg-slate-950/40">
        <form onSubmit={handleSubmit} className="relative max-w-4xl mx-auto group">
          <div className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-600 font-mono text-xs pointer-events-none group-focus-within:text-indigo-500 transition-colors">
            {'>'}
          </div>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Review vault risk against current GHS inflation news..."
            className="w-full bg-slate-950/60 border border-white/10 rounded-[2rem] pl-12 pr-20 py-6 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-white font-medium shadow-2xl transition-all hover:border-white/20"
          />
          <button 
            type="submit" 
            disabled={loading || !input.trim()}
            className="absolute right-4 top-1/2 -translate-y-1/2 w-14 h-14 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl shadow-xl transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center border border-white/10"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
          </button>
        </form>
        <div className="flex justify-center gap-6 mt-6">
           <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest flex items-center gap-2">
              <span className="w-1 h-1 bg-slate-700 rounded-full"></span> Encrypted Pipeline
           </span>
           <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest flex items-center gap-2">
              <span className="w-1 h-1 bg-slate-700 rounded-full"></span> Amoy Validated
           </span>
        </div>
      </div>
    </div>
  );
};

export default AIAdvisor;
