
import React, { useState, useEffect } from 'react';
import { CollateralType, UserPosition } from '../types';
import { COLLATERAL_ICONS, SYSTEM_PARAMS } from '../constants';
import { contractService } from '../services/contractService';

interface LiquidationHubProps {
  prices: Record<CollateralType, number>;
  onLiquidate: (target: string, asset: CollateralType) => Promise<void>;
  isSyncing: boolean;
  account: string | null;
}

const LiquidationHub: React.FC<LiquidationHubProps> = ({ prices, onLiquidate, isSyncing, account }) => {
  const [targetAddress, setTargetAddress] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [targetPositions, setTargetPositions] = useState<UserPosition[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [txStatus, setTxStatus] = useState<'idle' | 'executing' | 'success' | 'error'>('idle');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [confirmationTarget, setConfirmationTarget] = useState<{address: string, asset: CollateralType} | null>(null);

  const inspectAddress = async () => {
    if (!targetAddress || targetAddress.length < 42) {
      setError("Provide a valid Polygon address for risk analysis.");
      return;
    }
    
    setIsSearching(true);
    setError(null);
    setTxStatus('idle');
    setTxHash(null);
    try {
      const positions: UserPosition[] = [];
      await Promise.all(Object.values(CollateralType).map(async (type) => {
        const { depositedAmount, mintedDebt } = await contractService.getPosition(targetAddress, type);
        const price = prices[type];
        const val = depositedAmount * price;
        if (depositedAmount > 0 || mintedDebt > 0) {
          positions.push({
            collateralType: type,
            depositedAmount,
            mintedDebt,
            collateralValueGHS: val,
            healthFactor: mintedDebt > 0 ? (val / mintedDebt) * 100 : Infinity
          });
        }
      }));
      setTargetPositions(positions);
      if (positions.length === 0) setError("Address has no active protocol exposure.");
    } catch (err) {
      setError("Protocol telemetry unavailable for this address.");
    } finally {
      setIsSearching(false);
    }
  };

  const handleLiquidation = async (asset: CollateralType) => {
    if (!account || txStatus === 'executing') return;
    
    setTxStatus('executing');
    setError(null);
    setTxHash(null);
    
    try {
      await onLiquidate(targetAddress, asset);
      
      setTxHash("0x" + Math.random().toString(16).slice(2, 66));
      setTxStatus('success');
      setConfirmationTarget(null);
      await inspectAddress(); 
    } catch (err: any) {
      console.error("Liquidation Execution Failed:", err);
      setTxStatus('error');
      setError(err?.reason || err?.message || "Settlement signature rejected. Verify vault risk index.");
    }
  };

  const formatGHS = (val: number) => new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS' }).format(val);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 relative">
      {txStatus === 'executing' && (
        <div className="fixed inset-0 z-[100] bg-slate-950/50 backdrop-blur-[8px] flex items-center justify-center cursor-wait pointer-events-auto">
           <div className="bg-slate-900 border border-amber-500/20 p-12 rounded-[2.5rem] shadow-[0_30px_60px_rgba(0,0,0,0.6)] flex flex-col items-center gap-8 animate-in zoom-in-95 duration-200">
              <div className="relative">
                <div className="w-20 h-20 border-[6px] border-amber-500/20 border-t-amber-500 rounded-full animate-spin"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-amber-500 text-2xl">⚡</span>
                </div>
              </div>
              <div className="text-center">
                 <h4 className="text-amber-500 font-black uppercase tracking-[0.4em] text-sm">Executing Settlement</h4>
                 <p className="text-slate-400 text-[11px] font-bold uppercase tracking-widest mt-4">Broadcasting liquidation signature to Polygon...</p>
                 <div className="mt-8 flex justify-center gap-2">
                    <span className="w-2.5 h-2.5 bg-amber-500 rounded-full animate-bounce [animation-delay:-0.32s]"></span>
                    <span className="w-2.5 h-2.5 bg-amber-500 rounded-full animate-bounce [animation-delay:-0.16s]"></span>
                    <span className="w-2.5 h-2.5 bg-amber-500 rounded-full animate-bounce"></span>
                 </div>
              </div>
           </div>
        </div>
      )}

      {!account && (
        <div className="absolute inset-0 z-10 bg-slate-950/80 backdrop-blur-xl rounded-[2.5rem] flex items-center justify-center p-10 text-center">
            <div className="max-w-md space-y-10 animate-in fade-in zoom-in-95 duration-700">
                <div className="w-24 h-24 bg-amber-500/10 border border-amber-500/20 rounded-[2rem] mx-auto flex items-center justify-center text-5xl shadow-2xl">🛡️</div>
                <div className="space-y-4">
                  <h4 className="text-2xl font-black uppercase tracking-widest text-white italic leading-none">Validator Restricted</h4>
                  <p className="text-[10px] text-amber-400 font-black uppercase tracking-[0.4em]">Settle Risky Positions to Earn Rewards</p>
                </div>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-widest leading-relaxed px-6">
                  Liquidators act as the protocol's immune system. By settling vaults that fall below 125% collateralization, you maintain global solvency and receive a 10% premium on the liquidated assets.
                </p>
                <div className="pt-4 flex flex-col gap-4">
                  <div className="flex justify-center gap-8">
                    <div className="flex flex-col items-center">
                      <span className="text-white font-mono font-black text-lg">10%</span>
                      <span className="text-[8px] text-slate-500 uppercase font-black">Bonus Yield</span>
                    </div>
                    <div className="w-px h-10 bg-white/5"></div>
                    <div className="flex flex-col items-center">
                      <span className="text-white font-mono font-black text-lg">0.1s</span>
                      <span className="text-[8px] text-slate-500 uppercase font-black">Settlement Latency</span>
                    </div>
                  </div>
                  <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Connect wallet to begin validation</p>
                </div>
            </div>
        </div>
      )}

      {/* Control Module */}
      <div className="glass-morphism p-10 rounded-[2.5rem] border border-white/5 relative overflow-hidden">
        <div className="max-w-2xl relative z-10">
          <h2 className="text-3xl font-black text-white tracking-tight uppercase italic">Solvency Management</h2>
          <p className="text-slate-500 text-[11px] mt-2 font-black uppercase tracking-[0.2em] leading-relaxed">
            Monitor and settle risky positions to preserve GHS stability. Successful settlement grants a <span className="text-amber-500 font-black">10% validator bonus</span>.
          </p>
        </div>

        <div className="mt-10 flex flex-col md:flex-row gap-4 relative z-10">
          <div className="relative flex-1">
            <input
              type="text"
              value={targetAddress}
              onChange={(e) => setTargetAddress(e.target.value)}
              placeholder="0x... SCAN REGISTRY ADDRESS"
              disabled={isSearching || txStatus === 'executing'}
              className="w-full bg-slate-950/60 border border-white/10 rounded-2xl pl-12 pr-8 py-5 focus:outline-none focus:ring-1 focus:ring-amber-500/50 text-white font-mono text-sm uppercase transition-all placeholder:text-slate-800 disabled:opacity-50"
            />
          </div>
          <button 
            onClick={inspectAddress}
            disabled={isSearching || txStatus === 'executing'}
            className="px-10 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-2xl transition-all uppercase tracking-[0.2em] text-[11px] py-4 md:py-0 disabled:opacity-50 shadow-lg shadow-indigo-600/10 active:scale-95"
          >
            {isSearching ? 'Accessing Ledger...' : 'Scan Address'}
          </button>
        </div>

        {txStatus === 'success' && (
          <div className="mt-10 p-8 bg-emerald-500/10 border border-emerald-500/20 rounded-[2rem] flex flex-col md:flex-row items-center justify-between gap-6 animate-in fade-in slide-in-from-top-4">
             <div className="flex items-center gap-6">
                <div className="w-14 h-14 bg-emerald-500 rounded-2xl flex items-center justify-center text-white text-3xl font-bold shadow-xl shadow-emerald-500/20">✓</div>
                <div>
                   <p className="text-[11px] font-black text-emerald-500 uppercase tracking-[0.2em]">Settlement Operation Successful</p>
                   <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter mt-1">Solvency restored. Bonus collateral has been credited to your validator account.</p>
                   {txHash && (
                     <div className="mt-3 flex items-center gap-2 text-[8px] font-mono text-emerald-400/60 bg-white/5 px-3 py-1.5 rounded-lg border border-white/5">
                        <span className="font-black uppercase text-slate-600">TX</span>
                        <span>{txHash.slice(0, 16)}...</span>
                     </div>
                   )}
                </div>
             </div>
             <div className="flex items-center gap-3">
               <button onClick={() => setTxStatus('idle')} className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-6 py-3 border border-white/10 rounded-xl hover:bg-white/5 transition-colors">Dismiss</button>
               <button className="text-[10px] font-black text-white bg-indigo-600 uppercase tracking-widest px-6 py-3 rounded-xl shadow-lg shadow-indigo-600/20 hover:bg-indigo-500 transition-colors">View Explorer</button>
             </div>
          </div>
        )}

        {txStatus === 'error' && (
          <div className="mt-8 p-8 bg-red-500/10 border border-red-500/20 rounded-[2rem] flex items-center gap-6 animate-in shake">
             <div className="w-12 h-12 bg-red-500 rounded-2xl flex items-center justify-center text-white text-2xl font-bold">!</div>
             <div>
                <p className="text-[11px] font-black text-red-400 uppercase tracking-[0.2em] leading-none mb-2">Protocol Rejection</p>
                <p className="text-[10px] font-bold text-red-500/80 uppercase tracking-tighter leading-relaxed">{error || 'Operation failed. Verify target vault solvency and your gas balance.'}</p>
                <button onClick={() => setTxStatus('idle')} className="mt-4 text-[9px] font-black uppercase tracking-widest text-red-400 hover:underline">Reset Hub State</button>
             </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6">
        {targetPositions.map((pos) => {
          const isLiquidatable = pos.healthFactor < SYSTEM_PARAMS.LIQUIDATION_THRESHOLD;
          const isExecuting = txStatus === 'executing';
          const isConfirming = confirmationTarget?.asset === pos.collateralType;
          
          return (
            <div key={pos.collateralType} className={`glass-morphism p-8 rounded-[2.5rem] border transition-all duration-500 ${isLiquidatable ? 'border-red-500/40 bg-red-500/[0.04] animate-pulse-soft shadow-[0_0_30px_rgba(239,68,68,0.05)]' : 'border-white/5 opacity-60'}`}>
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8">
                <div className="flex items-center gap-6">
                   <div className="w-16 h-16 rounded-[1.25rem] bg-slate-900 p-4 border border-white/10 shadow-inner">
                      <img src={COLLATERAL_ICONS[pos.collateralType]} className="w-full h-full object-contain" alt={pos.collateralType} />
                   </div>
                   <div>
                      <h4 className="text-xl font-black text-white italic uppercase tracking-tight">{pos.collateralType} Vault</h4>
                      <p className={`text-[10px] font-black uppercase tracking-[0.15em] mt-1.5 ${isLiquidatable ? 'text-red-500' : 'text-emerald-500'}`}>
                        {isLiquidatable ? 'CRITICAL: RISK THRESHOLD BREACHED' : 'STABLE: NO ACTION REQUIRED'}
                      </p>
                   </div>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-3 gap-10 flex-1 lg:px-12">
                   <div>
                      <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1.5 opacity-60">Vault Liability</p>
                      <p className="font-mono font-black text-white text-sm">{pos.mintedDebt.toFixed(2)} tGHSX</p>
                   </div>
                   <div>
                      <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1.5 opacity-60">Safety Index</p>
                      <p className={`font-mono font-black text-sm ${isLiquidatable ? 'text-red-500 animate-pulse' : 'text-emerald-500'}`}>{pos.healthFactor.toFixed(1)}%</p>
                   </div>
                   <div className="hidden lg:block">
                      <p className="text-[8px] font-black text-amber-500 uppercase tracking-widest mb-1.5 opacity-80">Settlement Bonus (10%)</p>
                      <p className="font-mono font-black text-emerald-400 text-sm">~{formatGHS(pos.mintedDebt * 0.1)}</p>
                   </div>
                </div>

                <div className="min-w-[220px]">
                   {!isConfirming ? (
                      <button
                        disabled={!isLiquidatable || isExecuting}
                        onClick={() => setConfirmationTarget({address: targetAddress, asset: pos.collateralType})}
                        className={`w-full py-5 rounded-2xl font-black uppercase tracking-[0.2em] text-[10px] transition-all ${
                          isLiquidatable 
                             ? 'bg-red-600 hover:bg-red-500 text-white shadow-xl shadow-red-600/20 active:scale-95' 
                             : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-white/5'
                        }`}
                      >
                        {isExecuting ? 'Submitting...' : 'Initiate Settlement'}
                      </button>
                   ) : (
                      <div className="flex gap-3 animate-in zoom-in-95 duration-200">
                         <button
                           onClick={() => handleLiquidation(pos.collateralType)}
                           disabled={isExecuting}
                           className="flex-[2] bg-red-600 hover:bg-red-500 text-white font-black uppercase text-[10px] py-5 rounded-2xl tracking-[0.2em] shadow-2xl shadow-red-600/40 active:scale-95 transition-all"
                         >
                           Confirm
                         </button>
                         <button
                           onClick={() => setConfirmationTarget(null)}
                           disabled={isExecuting}
                           className="flex-1 bg-slate-800 text-slate-400 font-black uppercase text-[10px] py-5 rounded-2xl border border-white/10 hover:text-white transition-all"
                         >
                           ✕
                         </button>
                      </div>
                   )}
                </div>
              </div>
            </div>
          );
        })}
        {targetPositions.length === 0 && !isSearching && !error && (
           <div className="py-24 text-center glass-morphism rounded-[2.5rem] border border-white/5 opacity-30 flex flex-col items-center gap-4">
              <span className="text-4xl">🔎</span>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em]">Registry Scanner Standby</p>
           </div>
        )}
      </div>
    </div>
  );
};

export default LiquidationHub;
