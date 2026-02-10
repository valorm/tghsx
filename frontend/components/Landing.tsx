
import React from 'react';

interface LandingProps {
  onEnter: () => void;
}

const Landing: React.FC<LandingProps> = ({ onEnter }) => {
  return (
    <div className="min-h-screen flex flex-col items-center justify-start p-4 md:p-8 relative">
      {/* Dynamic Background Elements - Using smaller sizes for mobile to prevent overflow issues */}
      <div className="absolute top-[-5%] left-[-5%] w-[80%] md:w-[50%] h-[40%] bg-indigo-600/10 rounded-full blur-[80px] md:blur-[120px] -z-10 animate-pulse-soft"></div>
      <div className="absolute bottom-[-5%] right-[-5%] w-[80%] md:w-[50%] h-[40%] bg-violet-600/10 rounded-full blur-[80px] md:blur-[120px] -z-10"></div>

      <div className="max-w-4xl w-full pt-12 md:pt-24 space-y-16 md:space-y-24 z-10">
        {/* Network Status Badge */}
        <div className="flex justify-center animate-in fade-in duration-1000">
          <div className="px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
            <span className="text-[9px] font-black text-emerald-500 uppercase tracking-[0.2em]">Network: Polygon Amoy Testnet</span>
          </div>
        </div>

        {/* 1️⃣ Value Proposition & Audience Filter */}
        <section className="text-center space-y-8 animate-in fade-in slide-in-from-top-8 duration-1000">
          <div className="flex justify-center items-center gap-3 md:gap-4 mb-8">
            <div className="w-10 h-10 md:w-12 md:h-12 bg-indigo-600 rounded-xl md:rounded-2xl flex items-center justify-center font-black text-lg md:text-xl text-white shadow-2xl shadow-indigo-600/40">tG</div>
            <span className="text-xl md:text-2xl font-black tracking-tighter text-white italic">tGHSX PROTOCOL</span>
          </div>
          
          <h1 className="text-3xl sm:text-4xl md:text-6xl font-black text-white tracking-tight leading-tight uppercase italic max-w-3xl mx-auto break-words">
            Decentralized Stability for the <span className="text-indigo-400">Ghanaian Cedi.</span>
          </h1>
          <p className="text-base md:text-xl text-slate-400 font-medium max-w-2xl mx-auto leading-relaxed px-2">
            tGHSX is an over-collateralized, on-chain stablecoin protocol. 
            Mint liquid capital against your crypto assets while maintaining sovereign control.
          </p>

          <div className="max-w-xl mx-auto px-4 sm:px-6 py-4 rounded-2xl bg-white/[0.03] border border-white/5">
            <p className="text-[10px] md:text-[11px] text-slate-500 font-black uppercase tracking-[0.15em] md:tracking-[0.2em] leading-relaxed">
              This is a DeFi protocol interface — not a bank, wallet, or payment app.
              <span className="text-slate-400 block mt-2 opacity-80">Requires technical familiarity with non-custodial wallets and Polygon network.</span>
            </p>
          </div>

          <div className="pt-4">
            <button 
              onClick={onEnter}
              className="group relative w-full sm:w-auto px-12 py-5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black uppercase tracking-[0.3em] text-[11px] shadow-2xl shadow-indigo-600/40 transition-all active:scale-95 overflow-hidden"
            >
              <span className="relative z-10 flex items-center justify-center gap-3">
                Enter Application
                <svg className="w-4 h-4 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
              </span>
            </button>
          </div>
        </section>

        {/* 2️⃣ Simple "How it Works" (Responsive Grid) */}
        <section className="space-y-8 md:space-y-12 animate-in fade-in slide-in-from-bottom-12 duration-1000 delay-300">
          <div className="text-center space-y-2">
            <h2 className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.4em]">Protocol Mechanics</h2>
            <p className="text-white font-bold text-xl italic uppercase tracking-tight">System Core</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
            {[
              { 
                step: "01", 
                title: "Deposit", 
                desc: "Lock approved crypto assets into a non-custodial vault.",
                icon: "📥"
              },
              { 
                step: "02", 
                title: "Mint", 
                desc: "Generate tGHSX liquidity against over-collateralized positions.",
                icon: "💎"
              },
              { 
                step: "03", 
                title: "Safety", 
                desc: "Positions below required ratios are automatically liquidated.",
                icon: "🛡️"
              }
            ].map((item, i) => (
              <div key={i} className="glass-morphism p-6 md:p-8 rounded-[1.5rem] md:rounded-[2rem] border border-white/5 relative group transition-all hover:border-indigo-500/30">
                <span className="absolute top-4 right-6 md:top-6 md:right-8 font-mono text-3xl md:text-4xl font-black text-white/5 group-hover:text-indigo-500/10 transition-colors">{item.step}</span>
                <div className="text-2xl md:text-3xl mb-4 md:mb-6">{item.icon}</div>
                <h3 className="text-white font-black uppercase tracking-tight mb-2 md:mb-3 italic">{item.title}</h3>
                <p className="text-[10px] md:text-xs text-slate-500 font-bold leading-relaxed uppercase tracking-wider">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* 3️⃣ Explicit Risk Disclaimer Block (Responsive Padding) */}
        <section className="max-w-3xl mx-auto p-6 sm:p-8 md:p-12 rounded-[2rem] md:rounded-[3rem] bg-amber-500/[0.04] border border-amber-500/30 space-y-6 md:space-y-8 animate-in fade-in duration-1000 delay-500 shadow-[0_0_50px_rgba(245,158,11,0.05)]">
          <div className="flex flex-col items-center gap-3 md:gap-4 text-center">
            <div className="w-12 h-12 md:w-16 md:h-16 bg-amber-500/10 rounded-full flex items-center justify-center text-2xl md:text-3xl mb-1">⚠️</div>
            <h3 className="text-amber-500 font-black uppercase tracking-[0.3em] md:tracking-[0.4em] text-[12px] md:text-sm italic">Experimental Protocol Warning</h3>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
            <div className="space-y-3 md:space-y-4 text-center md:text-left">
              <h4 className="text-[9px] md:text-[10px] font-black text-slate-300 uppercase tracking-widest border-b border-white/10 pb-2">Technical Risk</h4>
              <p className="text-[10px] md:text-[11px] text-slate-400 font-bold uppercase tracking-widest leading-relaxed">
                tGHSX is in V1.1 Beta on Polygon Testnet. Smart contracts are experimental and have not undergone a formal multi-signature audit. 
              </p>
            </div>
            <div className="space-y-3 md:space-y-4 text-center md:text-left">
              <h4 className="text-[9px] md:text-[10px] font-black text-slate-300 uppercase tracking-widest border-b border-white/10 pb-2">Market Risk</h4>
              <p className="text-[10px] md:text-[11px] text-slate-400 font-bold uppercase tracking-widest leading-relaxed">
                Asset volatility can lead to <span className="text-red-500">total loss of collateral</span>. Ratios are monitored 24/7 by automated validators.
              </p>
            </div>
          </div>
          
          <div className="pt-4 border-t border-white/5 text-center">
            <p className="text-[8px] md:text-[9px] text-slate-500 font-black uppercase tracking-[0.2em] md:tracking-[0.3em]">Use at your own risk. Protocol mechanics are immutable.</p>
          </div>
        </section>

        {/* Footer */}
        <footer className="pt-8 pb-16 md:pb-24 text-center space-y-4 animate-in fade-in duration-1000 delay-700 opacity-40">
          <p className="text-[8px] md:text-[9px] font-black text-slate-600 uppercase tracking-[0.4em] md:tracking-[0.5em]">Open Source • Sovereign • Non-Custodial</p>
          <div className="flex justify-center gap-4">
            <span className="text-[9px] md:text-[10px] font-black text-slate-600 uppercase tracking-widest">Build v1.1-Stable</span>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default Landing;
