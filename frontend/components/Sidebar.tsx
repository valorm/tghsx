
import React, { useState, useEffect } from 'react';
import { ActiveTab } from '../types';

interface SidebarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  account: string | null;
  isSyncing: boolean;
  lastSync: number;
  onGoHome: () => void;
  isOpen: boolean;
  onClose: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab, account, isSyncing, lastSync, onGoHome, isOpen, onClose }) => {
  const [gas, setGas] = useState(25);
  const [block, setBlock] = useState(12840592);

  useEffect(() => {
    const interval = setInterval(() => {
      setGas(prev => Math.max(10, Math.min(100, prev + (Math.random() - 0.5) * 5)));
      if (Math.random() > 0.7) setBlock(prev => prev + 1);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const navItems = [
    { id: 'dashboard', label: 'Monitor', icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
    )},
    { id: 'vaults', label: 'Liquidity', icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
    )},
    { id: 'liquidate', label: 'Safety', icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
    )},
    { id: 'ai', label: 'Advisor', icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
    )},
  ] as const;

  return (
    <>
      <div
        className={`lg:hidden fixed inset-0 bg-black/60 z-40 transition-opacity ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />

      <aside className={`fixed lg:static top-0 left-0 h-screen w-64 glass-morphism border-r border-white/5 p-6 z-50 flex flex-col transform transition-transform duration-300 lg:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
      <button
        onClick={onClose}
        className="lg:hidden self-end mb-4 text-slate-400 hover:text-white text-xs font-black uppercase tracking-[0.2em]"
      >
        Close ✕
      </button>
      <button 
        onClick={onGoHome}
        className="mb-12 px-2 flex items-center gap-3 group hover:opacity-80 transition-opacity text-left"
      >
        <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center font-black text-white shadow-lg shadow-indigo-600/20 group-hover:scale-110 transition-transform">tG</div>
        <div className="flex flex-col">
          <span className="font-bold text-lg tracking-tight text-white leading-tight italic">tGHSX</span>
          <span className="text-[8px] text-indigo-400 font-bold uppercase tracking-[0.2em]">Sovereign Stable</span>
        </div>
      </button>

      <nav className="flex-1 space-y-1">
        <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-4 px-4 opacity-50">Protocol Console</p>
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => {
              setActiveTab(item.id);
              onClose();
            }}
            className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-xl transition-all relative ${
              activeTab === item.id
                ? 'bg-indigo-600/10 text-white border border-indigo-500/20 tab-active'
                : 'text-slate-500 hover:text-slate-300 hover:bg-white/5 border border-transparent'
            }`}
          >
            <span className={activeTab === item.id ? 'text-indigo-400' : 'text-slate-500'}>
              {item.icon}
            </span>
            <span className="font-semibold text-sm">{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="mt-auto space-y-4 pt-6 border-t border-white/5">
        <div className="bg-slate-950/40 p-4 rounded-xl space-y-3">
           <div className="flex justify-between items-center text-[9px] font-bold uppercase">
              <span className="text-slate-500">Polygon Gas</span>
              <span className="text-emerald-500">{gas.toFixed(0)} Gwei</span>
           </div>
           <div className="flex justify-between items-center text-[9px] font-bold uppercase">
              <span className="text-slate-500">Node Sync</span>
              <span className="text-indigo-400 font-mono">#{block.toLocaleString()}</span>
           </div>
        </div>

        {account && (
          <div className="flex items-center gap-3 px-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]"></div>
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Network Verified</span>
          </div>
        )}
      </div>
    </aside>
    </>
  );
};

export default Sidebar;
