
import React, { useState, useEffect, useMemo } from 'react';
import { UserPosition, Transaction, CollateralType, ProtocolStats } from '../types';
import { COLLATERAL_ICONS, SYSTEM_PARAMS } from '../constants';

interface DashboardProps {
  positions: UserPosition[];
  protocolStats: ProtocolStats;
  transactions: Transaction[];
  prices: Record<CollateralType, number>;
  account: string | null;
}

const formatGHS = (value: number) => {
  return new Intl.NumberFormat('en-GH', {
    style: 'currency',
    currency: 'GHS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
};

const Dashboard: React.FC<DashboardProps> = ({ positions, protocolStats, transactions, prices, account }) => {
  const [driftedPrices, setDriftedPrices] = useState<Record<CollateralType, number>>(prices);
  
  useEffect(() => {
    const timer = setInterval(() => {
      setDriftedPrices(prev => {
        const next = { ...prev };
        (Object.keys(next) as CollateralType[]).forEach(k => {
          const drift = 1 + (Math.random() - 0.5) * 0.0001;
          next[k] = prev[k] * drift;
        });
        return next;
      });
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    setDriftedPrices(prices);
  }, [prices]);

  const userHealth = useMemo(() => {
    if (protocolStats.userDebt <= 0) return Infinity;
    return (protocolStats.userTVL / protocolStats.userDebt) * 100;
  }, [protocolStats]);

  const dropToLiquidation = useMemo(() => {
    if (userHealth === Infinity || userHealth === 0) return null;
    const drop = (1 - (SYSTEM_PARAMS.LIQUIDATION_THRESHOLD / userHealth)) * 100;
    return Math.max(0, drop);
  }, [userHealth]);

  const getHealthStatus = (hf: number, drop: number | null) => {
    if (hf === Infinity) return { label: 'OPTIMAL', color: 'text-emerald-500', bar: 'bg-emerald-500', aggressive: false, detail: 'No active debt liabilities.' };
    if (hf >= 160) return { label: 'SECURE', color: 'text-emerald-500', bar: 'bg-emerald-500', aggressive: false, detail: 'Comfortable safety margin.' };
    if (hf >= 145) return { label: 'CAUTION', color: 'text-amber-500', bar: 'bg-amber-500', aggressive: false, detail: `A ${drop?.toFixed(1)}% price drop will liquidate you.` };
    if (hf >= 125) return { label: 'DANGER', color: 'text-orange-500', bar: 'bg-orange-500', aggressive: true, warning: 'YOU ARE CLOSE TO LIQUIDATION', detail: `URGENT: A ${drop?.toFixed(1)}% price drop will result in a total loss of your assets.` };
    return { label: 'CRITICAL', color: 'text-red-500', bar: 'bg-red-500', aggressive: true, warning: 'LIQUIDATION IN PROGRESS', detail: 'Validators are currently settling your debt. You have lost your collateral.' };
  };

  const status = getHealthStatus(userHealth, dropToLiquidation);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Protocol Ticker */}
      <div className="overflow-hidden glass-morphism border border-white/5 rounded-xl h-12 flex items-center relative">
        <div className="absolute left-0 top-0 bottom-0 px-4 bg-slate-900 border-r border-white/10 text-slate-500 text-[8px] font-black uppercase flex items-center z-20 tracking-widest backdrop-blur-md">
          MARKET INDEX
        </div>
        <div className="flex gap-16 animate-[ticker_40s_linear_infinite] whitespace-nowrap pl-32 z-10 font-mono">
          {[...Object.entries(driftedPrices), ...Object.entries(driftedPrices)].map(([asset, price], idx) => (
            <div key={`${asset}-${idx}`} className="flex items-center gap-4 group">
              <img 
                src={COLLATERAL_ICONS[asset as CollateralType]} 
                className="w-4 h-4 object-contain opacity-60 filter grayscale group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-300" 
                alt="" 
              />
              <span className="text-[9px] text-slate-500 font-black uppercase tracking-widest">
                {asset === 'WETH' ? 'ETH/GHS' : `${asset}/GHS`}
              </span>
              <span className="text-sm font-bold text-white/90">
                {formatGHS(price as number)}
              </span>
              <span className="w-1.5 h-1.5 bg-indigo-500/20 rounded-full"></span>
            </div>
          ))}
        </div>
      </div>

      <style>{`@keyframes ticker { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }`}</style>

      {/* Analytics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'Global TVL', value: formatGHS(protocolStats.globalTVL), icon: '🏛️', sub: 'Total protocol liquidity' },
          { label: 'Circulation', value: formatGHS(protocolStats.globalDebt), icon: '💎', sub: 'Total minted tGHSX' },
          { 
            label: 'Your Health', 
            value: account ? (userHealth === Infinity ? 'SAFE' : `${userHealth.toFixed(1)}%`) : 'READ-ONLY', 
            icon: '🛡️', 
            sub: account ? status.label : 'Authorized status only',
            color: account ? status.color : 'text-slate-500'
          },
          { 
            label: 'Margin to Liquidation', 
            value: account && dropToLiquidation !== null ? `-${dropToLiquidation.toFixed(1)}%` : '---', 
            icon: '📉', 
            sub: account ? 'Price drop tolerated' : 'Connect to see risk',
            color: account ? (dropToLiquidation !== null && dropToLiquidation < 10 ? 'text-red-500' : 'text-slate-200') : 'text-slate-500'
          }
        ].map((stat, i) => (
          <div key={i} className="glass-morphism p-5 rounded-2xl border border-white/5 relative overflow-hidden group transition-all hover:border-white/10">
            <div className="flex justify-between items-start mb-2 relative z-10">
              <span className="text-slate-500 text-[9px] font-black uppercase tracking-widest">{stat.label}</span>
              <span className="text-sm opacity-50 group-hover:scale-110 transition-transform">{stat.icon}</span>
            </div>
            <h3 className={`text-xl font-bold tracking-tight relative z-10 ${stat.color || 'text-white'}`}>{stat.value}</h3>
            <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest mt-1 relative z-10">{stat.sub}</p>
          </div>
        ))}
      </div>

      {account && status.aggressive && (
        <div className="bg-red-500/10 border border-red-500/30 p-5 rounded-2xl flex items-center justify-between animate-pulse shadow-[0_0_20px_rgba(239,68,68,0.15)]">
          <div className="flex items-center gap-4">
            <span className="text-2xl">🚨</span>
            <div>
               <p className="text-[10px] font-black text-red-500 uppercase tracking-[0.2em]">CRITICAL RISK ALERT</p>
               <p className="text-sm font-black text-white italic uppercase tracking-tight">{status.warning}</p>
               <p className="text-[10px] text-red-200/70 font-bold uppercase mt-1 leading-relaxed">{status.detail}</p>
            </div>
          </div>
          <p className="text-[10px] font-bold text-red-200 uppercase tracking-widest bg-red-500/20 px-4 py-1.5 rounded-lg border border-red-500/30">Action Required</p>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Vault Registry */}
        <div className="xl:col-span-8">
          <div className="glass-morphism rounded-3xl overflow-hidden border border-white/5 flex flex-col h-full">
            <div className="px-8 py-6 border-b border-white/5 flex justify-between items-center bg-white/[0.01]">
              <h3 className="text-lg font-bold text-white italic uppercase tracking-tight">Vault Registry</h3>
              <div className="flex items-center gap-2 px-3 py-1 bg-emerald-500/10 rounded-full border border-emerald-500/20">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                <span className="text-[8px] font-black text-emerald-500 uppercase tracking-widest">Live Registry</span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-950/40 text-slate-500 text-[9px] font-black uppercase tracking-[0.2em]">
                    <th className="px-8 py-4">Vault Asset</th>
                    <th className="px-8 py-4 text-right">Liquidity</th>
                    <th className="px-8 py-4 text-right">Liability</th>
                    <th className="px-8 py-4 text-right">Safety Index</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.02]">
                  {account && positions.length > 0 && positions.some(p => p.depositedAmount > 0 || p.mintedDebt > 0) ? (
                    positions.filter(p => p.depositedAmount > 0 || p.mintedDebt > 0).map((pos) => {
                      const posStatus = getHealthStatus(pos.healthFactor, null);
                      const posDrop = (1 - (SYSTEM_PARAMS.LIQUIDATION_THRESHOLD / pos.healthFactor)) * 100;
                      return (
                        <tr key={pos.collateralType} className="hover:bg-white/[0.01] transition-colors group">
                          <td className="px-8 py-6 flex items-center gap-3">
                            <img src={COLLATERAL_ICONS[pos.collateralType]} className="w-6 h-6 object-contain" />
                            <div className="flex flex-col">
                              <span className="font-bold text-white text-sm uppercase">{pos.collateralType}</span>
                              <span className={`text-[8px] font-black ${posDrop < 15 ? 'text-red-500' : 'text-slate-500'}`}>
                                {pos.healthFactor === Infinity ? 'NO LIQUIDATION RISK' : `A ${posDrop.toFixed(1)}% DROP LIQUIDATES YOU`}
                              </span>
                            </div>
                          </td>
                          <td className="px-8 py-6 text-right font-mono text-xs text-slate-400">{pos.depositedAmount.toFixed(4)}</td>
                          <td className="px-8 py-6 text-right font-mono text-sm font-bold text-white">{pos.mintedDebt.toLocaleString()} <span className="text-[8px] text-slate-500 uppercase">tGHSX</span></td>
                          <td className="px-8 py-6 text-right">
                            <div className="flex flex-col items-end">
                              <span className={`text-[10px] font-black ${posStatus.color}`}>{pos.healthFactor === Infinity ? 'SAFE' : `${pos.healthFactor.toFixed(1)}%`}</span>
                              <div className="w-16 h-1 bg-slate-800 rounded-full mt-1.5 overflow-hidden">
                                <div className={`h-full transition-all duration-700 ${posStatus.bar}`} style={{ width: `${Math.min(pos.healthFactor / 3, 100)}%` }} />
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={4} className="px-8 py-24 text-center">
                        <div className="text-4xl opacity-10 mb-4">{account ? "🔎" : "🔐"}</div>
                        <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest max-w-xs mx-auto leading-relaxed">
                           {account ? "No active positions found. Deposit collateral to start minting." : "Connect wallet to view your real-time risk telemetry."}
                        </p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Global Health Module */}
        <div className="xl:col-span-4 flex flex-col gap-6">
          <div className="glass-morphism rounded-3xl border border-white/5 p-8 flex-1 flex flex-col">
            <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-8">Protocol Solvency</h4>
            <div className="space-y-8">
               <div className="flex flex-col items-center justify-center py-8 border border-white/5 rounded-[2rem] bg-white/[0.02]">
                  <div className="relative w-28 h-28 mb-6">
                     <svg className="w-full h-full transform -rotate-90">
                        <circle cx="56" cy="56" r="50" fill="none" stroke="#1e293b" strokeWidth="8" />
                        <circle cx="56" cy="56" r="50" fill="none" stroke="#10b981" strokeWidth="8" strokeDasharray="314" strokeDashoffset="0" />
                     </svg>
                     <div className="absolute inset-0 flex items-center justify-center font-black text-emerald-500 text-[10px] tracking-tighter italic uppercase">Solvency Verified</div>
                  </div>
                  <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Reserve Validated</span>
               </div>
               
               <div className="space-y-4">
                  <div className="flex justify-between text-[10px] font-black uppercase text-slate-500 tracking-widest">
                     <span>Global Collateral Ratio</span>
                     <span className="text-white">
                       {protocolStats.globalDebt > 0 ? `${(protocolStats.globalTVL / protocolStats.globalDebt * 100).toFixed(1)}%` : '---'}
                     </span>
                  </div>
                  <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden border border-white/5">
                     <div className="h-full bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)] transition-all duration-1000" style={{ width: protocolStats.globalDebt > 0 ? '88%' : '0%' }}></div>
                  </div>
                  <div className="text-center">
                    <p className="text-[9px] text-slate-500 font-bold uppercase tracking-tight leading-relaxed opacity-60 px-4">
                       {protocolStats.globalDebt > 0 
                         ? 'Individual accounts are liquidated at 125%. Maintain a buffer of at least 150% to stay safe.' 
                         : 'No active protocol debt — safety index not applicable'}
                    </p>
                  </div>
               </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
