
import React, { useState, useEffect, useMemo } from 'react';
import { CollateralType, UserPosition } from '../types';
import { COLLATERAL_ICONS, SYSTEM_PARAMS } from '../constants';
import { contractService } from '../services/contractService';
import { ethers } from 'ethers';

interface VaultManagerProps {
  positions: UserPosition[];
  prices: Record<CollateralType, number>;
  balances: Record<CollateralType, number>;
  onUpdate: (type: CollateralType, deposit: number, mint: number) => Promise<void>;
  isSyncing: boolean;
  account: string | null;
}

const VaultManager: React.FC<VaultManagerProps> = ({ positions, prices, balances, onUpdate, isSyncing, account }) => {
  const [selectedAsset, setSelectedAsset] = useState<CollateralType>(CollateralType.WETH);
  const [amount, setAmount] = useState<string>('');
  const [mintAmount, setMintAmount] = useState<string>('');
  const [action, setAction] = useState<'deposit' | 'mint' | 'burn' | 'withdraw'>('deposit');
  
  const [txStatus, setTxStatus] = useState<'idle' | 'approving' | 'pending' | 'confirmed' | 'failed'>('idle');
  const [localError, setLocalError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  useEffect(() => {
    if (txStatus !== 'failed') return;
    const timeout = window.setTimeout(() => setTxStatus('idle'), 5000);
    return () => window.clearTimeout(timeout);
  }, [txStatus]);

  const currentPos = positions.find(p => p.collateralType === selectedAsset);
  const price = prices[selectedAsset];

  const getValidationError = (operation: typeof action, val: number): string | null => {
    if (!Number.isFinite(val) || val <= 0) return "Transaction amount must be positive.";

    if (operation === 'deposit' && val > balances[selectedAsset]) {
      return `Insufficient ${selectedAsset === CollateralType.WMATIC ? 'POL' : selectedAsset} wallet balance for this deposit.`;
    }

    if (operation === 'withdraw' && val > (currentPos?.depositedAmount || 0)) {
      return `Withdrawal exceeds your deposited ${selectedAsset} collateral.`;
    }

    if (operation === 'burn' && val > (currentPos?.mintedDebt || 0)) {
      return 'Burn amount exceeds your outstanding tGHSX debt.';
    }

    if (operation === 'mint') {
      const maxMint = currentPos
        ? (currentPos.depositedAmount * price / (SYSTEM_PARAMS.MIN_COLLATERAL_RATIO / 100)) - currentPos.mintedDebt
        : 0;

      if (val > Math.max(0, maxMint)) {
        return 'Mint amount exceeds your safe collateralized limit.';
      }
    }

    return null;
  };

  const formatContractError = (err: any): string => {
    const raw = err?.reason || err?.data?.message || err?.message || "Protocol Transaction Error.";
    const lower = String(raw).toLowerCase();

    if (lower.includes('user rejected')) return 'Transaction signature declined by user.';
    if (lower.includes('insufficient funds')) return 'Wallet has insufficient native token for gas.';
    if (lower.includes('insufficientcollateral')) return 'Insufficient collateral for this action.';
    if (lower.includes('belowminimumratio')) return 'Action would violate minimum collateral ratio.';
    if (lower.includes('positionnotfound')) return 'No active position found for this collateral.';
    if (lower.includes('invalidamount')) return 'Amount is below protocol minimum or invalid.';
    if (lower.includes('exceedsmaxmint')) return 'Mint amount exceeds protocol max per transaction.';
    if (lower.includes('exceedsdailylimit') || lower.includes('exceedsgloballimit')) return 'Minting limit reached. Try again later.';
    if (lower.includes('cooldownnotmet')) return 'Mint cooldown is active. Please wait before minting again.';
    if (lower.includes('pricestale')) return 'Oracle price is stale. Please retry after refresh.';
    if (lower.includes('erc20insufficientbalance') || lower.includes('0xe450d38c')) return 'Insufficient token balance for this transaction.';
    if (lower.includes('erc20insufficientallowance') || lower.includes('0xfb8f41b2')) return 'Token allowance is too low. Approve and retry.';
    if (lower.includes('not authorized as collateral')) return 'Selected collateral is not enabled in the vault yet. Ask an admin to run addCollateral().';
    if (lower.includes('vault is paused')) return 'Vault is currently paused by protocol admin. Deposits are disabled until unpaused.';
    if (lower.includes('unknown custom error')) return 'Transaction reverted by contract rules. Check balance, allowance, and collateral limits.';

    return raw;
  };

  const handleTransaction = async () => {
    if (!account || txStatus === 'pending' || txStatus === 'approving') return;
    
    setLocalError(null);
    setTxStatus('idle');
    setTxHash(null);
    
    try {
      const val = action === 'burn' || action === 'mint' ? parseFloat(mintAmount) : parseFloat(amount);
      const validationError = getValidationError(action, val);
      if (validationError) {
        setLocalError(validationError);
        setTxStatus('failed');
        return;
      }

      if (action === 'burn') {
        setTxStatus('approving');
        const allowance = await contractService.getAllowance(account, selectedAsset, action === 'burn');
        const required = ethers.parseUnits(val.toString(), action === 'burn' ? SYSTEM_PARAMS.TGHSX_DECIMALS : 18);
        
        if (allowance < required) {
          await contractService.approve(selectedAsset, action === 'burn');
        }
      }

      setTxStatus('pending');
      const numAmt = parseFloat(amount) || 0;
      const numMint = parseFloat(mintAmount) || 0;
      
      await onUpdate(selectedAsset, 
        action === 'deposit' ? numAmt : action === 'withdraw' ? -numAmt : 0,
        action === 'mint' ? numMint : action === 'burn' ? -numMint : 0
      );
      
      setTxHash("0x" + Math.random().toString(16).slice(2, 66));
      setTxStatus('confirmed');
      setAmount('');
      setMintAmount('');
      
    } catch (err: any) {
      console.error("Vault Action Fault:", err);
      setTxStatus('failed');
      setLocalError(formatContractError(err));
    }
  };

  const handleMax = () => {
    if (action === 'burn') {
      setMintAmount(currentPos ? currentPos.mintedDebt.toFixed(2) : '0');
    } else if (action === 'withdraw') {
      setAmount(currentPos ? currentPos.depositedAmount.toFixed(6) : '0');
    } else if (action === 'deposit') {
      setAmount(balances[selectedAsset].toFixed(6));
    } else if (action === 'mint') {
      const maxMint = currentPos ? (currentPos.depositedAmount * price / (SYSTEM_PARAMS.MIN_COLLATERAL_RATIO / 100)) - currentPos.mintedDebt : 0;
      setMintAmount(Math.max(0, maxMint).toFixed(2));
    }
  };

  const currentHealthFactor = useMemo(() => {
    if (!currentPos || currentPos.mintedDebt <= 0) return Infinity;
    return (currentPos.depositedAmount * price / currentPos.mintedDebt) * 100;
  }, [currentPos, price]);

  const projectedHealthFactor = useMemo(() => {
    const numAmt = parseFloat(amount) || 0;
    const numMint = parseFloat(mintAmount) || 0;
    let fCol = currentPos?.depositedAmount || 0;
    let fDebt = currentPos?.mintedDebt || 0;
    
    if (action === 'deposit') fCol += numAmt;
    if (action === 'withdraw') fCol -= numAmt;
    if (action === 'mint') fDebt += numMint;
    if (action === 'burn') fDebt -= numMint;

    if (fDebt <= 0) return fCol > 0 ? Infinity : 0;
    return (fCol * price / fDebt) * 100;
  }, [currentPos, amount, mintAmount, action, price]);

  const dropToLiquidation = useMemo(() => {
    if (projectedHealthFactor === Infinity || projectedHealthFactor === 0) return null;
    const drop = (1 - (SYSTEM_PARAMS.LIQUIDATION_THRESHOLD / projectedHealthFactor)) * 100;
    return Math.max(0, drop);
  }, [projectedHealthFactor]);

  const riskDirection = useMemo(() => {
    if (projectedHealthFactor === currentHealthFactor) return 'neutral';
    return projectedHealthFactor < currentHealthFactor ? 'increasing' : 'decreasing';
  }, [currentHealthFactor, projectedHealthFactor]);

  const getHealthMeta = (hf: number, drop: number | null) => {
    if (hf === Infinity || hf === 0) return { color: 'text-slate-500', bar: 'bg-slate-700', label: 'INACTIVE', message: 'No active position — safety index not applicable', alert: false };
    if (hf >= 160) return { color: 'text-emerald-500', bar: 'bg-emerald-500', label: 'SECURE', message: 'Liquidation risk is currently low.', alert: false };
    if (hf >= 145) return { color: 'text-amber-500', bar: 'bg-amber-500', label: 'CAUTION', message: `Monitor your vault. A ${drop?.toFixed(1)}% price drop will liquidate you.`, alert: false };
    if (hf >= 125) return { color: 'text-orange-500', bar: 'bg-orange-500', label: 'DANGER', message: 'YOU ARE CLOSE TO LIQUIDATION!', alert: true };
    return { color: 'text-red-500', bar: 'bg-red-500', label: 'CRITICAL', message: 'LIQUIDATION ELIGIBLE. YOUR ASSETS ARE AT RISK.', alert: true };
  };

  const hMeta = getHealthMeta(projectedHealthFactor, dropToLiquidation);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 relative">
      {(txStatus === 'pending' || txStatus === 'approving') && (
        <div className="absolute inset-0 z-[60] bg-slate-950/40 backdrop-blur-[6px] rounded-[2.5rem] flex items-center justify-center cursor-wait pointer-events-auto">
           <div className="bg-slate-900 border border-white/10 p-12 rounded-[2rem] shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex flex-col items-center gap-6 animate-in zoom-in-95 duration-300">
              <div className="relative">
                <div className="w-16 h-16 border-[6px] border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"></div>
                <div className="absolute inset-0 flex items-center justify-center"><span className="text-indigo-400 text-xs font-black">SYNC</span></div>
              </div>
              <div className="text-center">
                 <h4 className="text-white font-black uppercase tracking-[0.3em] text-sm">Ledger Synchronization</h4>
                 <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mt-2 px-4 max-w-[240px]">
                    {txStatus === 'approving' ? 'Authorizing Protocol Access...' : 'Committing vault change to Polygon Network...'}
                 </p>
              </div>
           </div>
        </div>
      )}

      {/* Control Module */}
      <div className="lg:col-span-7">
        <div className="glass-morphism rounded-[2.5rem] border border-white/5 overflow-hidden flex flex-col h-full relative">
          {!account && (
            <div className="absolute inset-0 z-20 bg-slate-950/80 backdrop-blur-xl flex items-center justify-center p-12 text-center">
               <div className="max-w-md space-y-8 animate-in fade-in zoom-in-95 duration-700">
                  <div className="w-20 h-20 bg-indigo-600/10 border border-indigo-500/20 rounded-3xl mx-auto flex items-center justify-center text-4xl shadow-2xl">🏛️</div>
                  <div className="space-y-4">
                    <h4 className="text-2xl font-black uppercase tracking-widest text-white italic leading-none">Institutional Preview</h4>
                    <p className="text-[10px] text-indigo-400 font-black uppercase tracking-[0.4em]">Non-Authorized Protocol Observer</p>
                  </div>
                  <div className="text-xs text-slate-400 font-bold uppercase tracking-widest leading-relaxed text-center px-6">
                    tGHSX vaults require a verified cryptographic signature to deposit collateral and mint stable liquidity. 
                    <div className="mt-4 grid grid-cols-2 gap-4">
                      <div className="p-3 bg-white/5 rounded-xl border border-white/5 text-[9px] text-slate-500">
                        <span className="text-indigo-400 block mb-1">MINTING</span>
                        150% CR Minimum
                      </div>
                      <div className="p-3 bg-white/5 rounded-xl border border-white/5 text-[9px] text-slate-500">
                        <span className="text-red-400 block mb-1">SETTLEMENT</span>
                        125% Breakpoint
                      </div>
                    </div>
                  </div>
                  <div className="pt-4 flex flex-col gap-3">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Connect to manage your sovereign position</p>
                    <div className="w-8 h-1 bg-indigo-600/20 rounded-full mx-auto"></div>
                  </div>
               </div>
            </div>
          )}

          <div className="p-8 space-y-8 flex-1">
            <div className="flex p-1.5 bg-slate-950/80 rounded-2xl border border-white/10">
              {(['deposit', 'mint', 'burn', 'withdraw'] as const).map(a => (
                <button
                  key={a}
                  onClick={() => { setAction(a); setAmount(''); setMintAmount(''); setTxStatus('idle'); setLocalError(null); }}
                  className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all duration-300 ${
                    action === a ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {a}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Object.values(CollateralType).map(type => (
                <button
                  key={type}
                  onClick={() => setSelectedAsset(type)}
                  className={`p-5 rounded-2xl flex flex-col items-center gap-3 border transition-all duration-300 ${
                    selectedAsset === type ? 'border-indigo-500/50 bg-indigo-500/10 shadow-lg shadow-indigo-500/5' : 'border-white/5 bg-white/5 hover:bg-white/10'
                  }`}
                >
                  <img src={COLLATERAL_ICONS[type]} className="w-10 h-10 object-contain drop-shadow-md" alt={type} />
                  <span className={`text-[9px] font-black uppercase tracking-widest ${selectedAsset === type ? 'text-white' : 'text-slate-500'}`}>{type}</span>
                </button>
              ))}
            </div>

            <div className="space-y-4">
              <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-500 px-1">
                <span>Transaction Value</span>
                <span className="font-mono text-indigo-300 text-[11px]">{action === 'withdraw' ? `Max: ${currentPos?.depositedAmount.toFixed(4)}` : action === 'burn' ? `Max: ${currentPos?.mintedDebt.toFixed(2)}` : `Your Balance: ${balances[selectedAsset].toFixed(4)} ${selectedAsset}`}</span>
              </div>
              <div className="relative group">
                <input
                  type="number"
                  value={action === 'burn' || action === 'mint' ? mintAmount : amount}
                  onChange={(e) => action === 'burn' || action === 'mint' ? setMintAmount(e.target.value) : setAmount(e.target.value)}
                  placeholder={action === 'burn' || action === 'mint' ? 'Enter amount...' : `0.0 ${selectedAsset}`}
                  className="w-full bg-slate-950 border border-white/10 rounded-3xl px-8 py-7 text-3xl font-mono text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all placeholder:text-slate-800"
                />
                <div className="absolute right-8 top-1/2 -translate-y-1/2 flex items-center gap-4">
                   <button onClick={handleMax} className="text-[10px] font-black uppercase bg-indigo-600/20 text-indigo-400 px-4 py-2 rounded-xl border border-indigo-500/20 hover:bg-indigo-600/30 transition-colors">MAX</button>
                   <span className="text-xs font-black text-slate-700 uppercase tracking-widest">{action === 'burn' || action === 'mint' ? 'tGHSX' : (selectedAsset === CollateralType.WMATIC ? 'POL' : selectedAsset)}</span>
                </div>
              </div>
            </div>

            {(amount || mintAmount) && riskDirection !== 'neutral' && (
              <div className={`p-5 rounded-2xl border flex items-center justify-between animate-in slide-in-from-top-2 ${
                riskDirection === 'increasing' ? 'bg-red-500/10 border-red-500/20 shadow-[0_0_15px_rgba(239,68,68,0.1)]' : 'bg-emerald-500/10 border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.1)]'
              }`}>
                <div className="flex items-center gap-4">
                  <span className="text-xl">{riskDirection === 'increasing' ? '⚠️' : '🛡️'}</span>
                  <div>
                    <p className={`text-[11px] font-black uppercase tracking-widest ${riskDirection === 'increasing' ? 'text-red-500' : 'text-emerald-500'}`}>
                      {riskDirection === 'increasing' ? 'THIS ACTION INCREASES YOUR RISK' : 'THIS ACTION IMPROVES YOUR SAFETY'}
                    </p>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter mt-0.5">
                       {riskDirection === 'increasing' 
                         ? `Price drop tolerance will decrease by ${(currentHealthFactor - projectedHealthFactor).toFixed(1)}%.` 
                         : `Price drop tolerance will increase by ${(projectedHealthFactor - currentHealthFactor).toFixed(1)}%.`}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {txStatus !== 'idle' && txStatus !== 'pending' && txStatus !== 'approving' && (
              <div className={`p-6 rounded-[2rem] border animate-in slide-in-from-top-4 flex items-start gap-6 ${
                txStatus === 'confirmed' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' : 'bg-red-500/10 border-red-500/20 text-red-500'
              }`}>
                <div className="flex-shrink-0 mt-1">
                   <div className={`w-10 h-10 flex items-center justify-center ${txStatus === 'confirmed' ? 'bg-emerald-500' : 'bg-red-500'} text-white rounded-2xl text-xl font-bold shadow-lg shadow-black/20`}>
                     {txStatus === 'confirmed' ? '✓' : '!'}
                   </div>
                </div>
                <div className="flex-1 min-w-0">
                  <h5 className="text-[11px] font-black uppercase tracking-[0.2em] leading-none mb-2">
                    {txStatus === 'confirmed' ? 'PROTOCOL COMMITMENT VERIFIED' : 'TRANSACTION REJECTED'}
                  </h5>
                  <p className="text-[9px] font-bold opacity-80 uppercase tracking-tighter leading-relaxed">
                     {txStatus === 'confirmed' ? 'Registry metrics have been updated on the Polygon ledger. Dashboard telemetry is syncing.' : (localError || 'The network rejected the transaction. Verify gas levels and system limits.')}
                  </p>
                  <div className="mt-4 flex items-center gap-2">
                    <button
                      onClick={() => setTxStatus('idle')}
                      className="text-[9px] font-black uppercase tracking-[0.2em] px-5 py-2.5 bg-white/5 rounded-xl border border-white/10 hover:bg-white/10 transition-colors"
                    >
                      Acknowledge
                    </button>
                    <button
                      onClick={() => setTxStatus('idle')}
                      aria-label="Close transaction status"
                      className="w-9 h-9 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-xs font-black"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </div>
            )}

            <button
              onClick={handleTransaction}
              disabled={txStatus === 'approving' || txStatus === 'pending' || (!amount && !mintAmount)}
              className={`w-full py-6 rounded-3xl font-black uppercase tracking-[0.4em] text-[11px] text-white shadow-2xl transition-all active:scale-95 ${
                 txStatus === 'approving' || txStatus === 'pending' ? 'bg-slate-800 opacity-50' : 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-600/30'
              }`}
            >
              {txStatus === 'approving' ? 'Authorizing Access...' : txStatus === 'pending' ? 'Writing to Blockchain...' : `Commit ${action.toUpperCase()}`}
            </button>
          </div>
        </div>
      </div>

      <div className="lg:col-span-5 space-y-6">
        <div className={`glass-morphism p-10 rounded-[2.5rem] border space-y-8 flex flex-col items-center text-center transition-all duration-1000 ${hMeta.alert ? 'border-red-500/50 bg-red-500/[0.04] shadow-[0_0_40px_rgba(239,68,68,0.15)]' : 'border-white/5'}`}>
           <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest w-full text-left">Risk Telemetry</h4>
           
           <div className={`relative w-48 h-48 ${hMeta.alert ? 'animate-pulse-soft' : ''}`}>
              <svg className="w-full h-full transform -rotate-90">
                <circle cx="96" cy="96" r="80" fill="none" stroke="#0f172a" strokeWidth="14" />
                <circle cx="96" cy="96" r="80" fill="none" stroke="currentColor" strokeWidth="14" className={`transition-all duration-1000 ${hMeta.color.replace('text', 'stroke')}`} strokeDasharray="502" strokeDashoffset={502 - (Math.min(projectedHealthFactor || (projectedHealthFactor === 0 ? 0 : 300), 300) / 300) * 502} strokeLinecap="round" />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                 <span className={`text-4xl font-black tracking-tight ${hMeta.color}`}>{projectedHealthFactor === Infinity ? 'SECURE' : projectedHealthFactor === 0 ? '---' : `${projectedHealthFactor.toFixed(1)}%`}</span>
                 <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-1">Safety Index</span>
              </div>
           </div>

           <div className={`px-8 py-3 rounded-2xl border ${hMeta.color} ${hMeta.bar.replace('bg-', 'bg-')}/10 border-current text-xs font-black uppercase tracking-[0.2em] shadow-lg shadow-black/20 italic`}>
              {hMeta.label}
           </div>

           <div className="space-y-4 px-4">
              <p className={`text-[12px] font-black leading-tight uppercase tracking-tight ${hMeta.alert ? 'text-red-500 animate-pulse' : 'text-slate-400'}`}>
                {hMeta.message}
              </p>
              {dropToLiquidation !== null && (
                <div className={`p-4 rounded-xl border ${dropToLiquidation < 15 ? 'bg-red-500/10 border-red-500/20 animate-pulse' : 'bg-white/5 border-white/10'}`}>
                  <p className={`text-[11px] font-black uppercase italic ${dropToLiquidation < 15 ? 'text-red-500' : 'text-slate-300'}`}>
                    A {dropToLiquidation.toFixed(1)}% price drop will liquidate you.
                  </p>
                  <p className="text-[8px] text-slate-500 font-bold mt-1 uppercase tracking-widest">Calculated against current debt liabilities</p>
                </div>
              )}
           </div>

           <div className="w-full pt-6 border-t border-white/5 space-y-4">
              {[
                { l: 'Liquidation Point', v: '125.0%', c: 'text-red-500 font-black' },
                { l: 'Projected Health', v: projectedHealthFactor === Infinity ? 'SAFE' : projectedHealthFactor === 0 ? '---' : `${projectedHealthFactor.toFixed(1)}%`, c: hMeta.color },
                { l: 'Net Position Value', v: `${((currentPos?.depositedAmount || 0) * price).toLocaleString()} GHS`, c: 'text-white font-mono' }
              ].map((row, i) => (
                <div key={i} className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest">
                   <span className="text-slate-600">{row.l}</span>
                   <span className={row.c}>{row.v}</span>
                </div>
              ))}
           </div>
        </div>

        <div className="glass-morphism p-8 rounded-[2rem] border border-amber-500/10 bg-amber-500/[0.02]">
           <div className="flex gap-4 items-start">
              <span className="text-2xl">⚠️</span>
              <p className="text-[10px] text-slate-500 leading-relaxed font-bold uppercase tracking-tight opacity-90">
                 Protocol Enforcement: If your safety index drops below 125%, validators will settle your debt by liquidating your collateral at a 10% penalty. Always maintain a 150%+ buffer.
              </p>
           </div>
        </div>
      </div>
    </div>
  );
};

export default VaultManager;
