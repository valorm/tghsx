
import React, { useState, useEffect, useCallback, useRef } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import VaultManager from './components/VaultManager';
import AIAdvisor from './components/AIAdvisor';
import LiquidationHub from './components/LiquidationHub';
import Landing from './components/Landing';
import { CollateralType, UserPosition, Transaction, ActiveTab, ProtocolStats } from './types';
import { INITIAL_PRICES, SYSTEM_PARAMS } from './constants';
import { contractService } from './services/contractService';
import { fetchLivePrices } from './services/priceService';

const App: React.FC = () => {
  const [view, setView] = useState<'landing' | 'app'>('landing');
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [account, setAccount] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    const saved = localStorage.getItem('tghsx_txs');
    return saved ? JSON.parse(saved) : [];
  });
  const [positions, setPositions] = useState<UserPosition[]>([]);
  const [protocolStats, setProtocolStats] = useState<ProtocolStats>({
    globalTVL: 0,
    globalDebt: 0,
    userTVL: 0,
    userDebt: 0,
    liquidationThreshold: SYSTEM_PARAMS.LIQUIDATION_THRESHOLD,
    minCollateralRatio: SYSTEM_PARAMS.MIN_COLLATERAL_RATIO
  });
  const [balances, setBalances] = useState<Record<CollateralType, number>>({
    [CollateralType.WETH]: 0,
    [CollateralType.WBTC]: 0,
    [CollateralType.USDC]: 0
  });
  const [prices, setPrices] = useState<Record<CollateralType, number>>(INITIAL_PRICES);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<number>(Date.now());
  
  const isSyncingRef = useRef(false);
  const priceInterval = useRef<number | null>(null);

  const syncProtocol = useCallback(async (userAddress?: string) => {
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;
    setIsSyncing(true);
    
    const targetAddress = userAddress || account;
    
    try {
      const currentPrices = await fetchLivePrices();
      setPrices(currentPrices);

      const global = await contractService.getVaultStats();
      
      let userTVL = 0;
      let userDebt = 0;

      if (targetAddress) {
        const updatedPositions: UserPosition[] = [];
        const updatedBalances: Record<string, number> = {};

        await Promise.all(Object.values(CollateralType).map(async (type) => {
          const { depositedAmount, mintedDebt } = await contractService.getPosition(targetAddress, type);
          const price = currentPrices[type];
          const val = depositedAmount * price;
          
          userTVL += val;
          userDebt += mintedDebt;

          updatedPositions.push({
            collateralType: type,
            depositedAmount,
            mintedDebt,
            collateralValueGHS: val,
            healthFactor: mintedDebt > 0 ? (val / mintedDebt) * 100 : Infinity
          });

          const bal = await contractService.getTokenBalance(targetAddress, type);
          updatedBalances[type] = bal;
        }));
        
        setPositions(updatedPositions);
        setBalances(updatedBalances as Record<CollateralType, number>);
      } else {
        setPositions([]);
        setBalances({ [CollateralType.WETH]: 0, [CollateralType.WBTC]: 0, [CollateralType.USDC]: 0 });
      }

      setProtocolStats({
        globalTVL: global.totalCollateral,
        globalDebt: global.totalDebt,
        userTVL: userTVL,
        userDebt: userDebt,
        liquidationThreshold: SYSTEM_PARAMS.LIQUIDATION_THRESHOLD,
        minCollateralRatio: SYSTEM_PARAMS.MIN_COLLATERAL_RATIO
      });

      setLastSyncTime(Date.now());
    } catch (err) {
      console.error("Sync Protocol Failed:", err);
    } finally {
      isSyncingRef.current = false;
      setIsSyncing(false);
    }
  }, [account]);

  const connectWallet = async () => {
    setError(null);
    try {
      const addr = await contractService.connect();
      setAccount(addr);
      await syncProtocol(addr);
    } catch (err: any) {
      setError(err.reason || err.message || "Failed to connect wallet.");
    }
  };

  const handleAction = async (type: CollateralType, deposit: number, mint: number) => {
    if (!account) return;
    try {
      let txReceipt;
      if (deposit > 0) txReceipt = await contractService.deposit(type, deposit);
      else if (deposit < 0) txReceipt = await contractService.withdraw(type, Math.abs(deposit));
      else if (mint > 0) txReceipt = await contractService.mint(type, mint);
      else if (mint < 0) txReceipt = await contractService.burn(type, Math.abs(mint));

      if (txReceipt) {
        const newTx: Transaction = {
          id: Math.random().toString(36).substr(2, 9),
          type: deposit > 0 ? 'deposit' : deposit < 0 ? 'withdraw' : mint > 0 ? 'mint' : 'burn',
          asset: deposit !== 0 ? type : 'tGHSX',
          amount: Math.abs(deposit !== 0 ? deposit : mint),
          timestamp: Date.now(),
          txHash: txReceipt.hash
        };
        const updatedTxs = [newTx, ...transactions].slice(0, 50);
        setTransactions(updatedTxs);
        localStorage.setItem('tghsx_txs', JSON.stringify(updatedTxs));
        
        await syncProtocol(account);
      }
    } catch (err: any) {
      setError(err.reason || err.data?.message || err.message || "Protocol Transaction Error.");
      throw err;
    }
  };

  const handleLiquidation = async (target: string, asset: CollateralType) => {
    if (!account) return;
    try {
      const txReceipt = await contractService.liquidate(target, asset);
      const newTx: Transaction = {
        id: Math.random().toString(36).substr(2, 9),
        type: 'liquidate',
        asset: asset,
        amount: 0,
        timestamp: Date.now(),
        txHash: txReceipt.hash
      };
      setTransactions([newTx, ...transactions].slice(0, 50));
      await syncProtocol(account);
    } catch (err: any) {
      setError(err.reason || err.message || "Liquidation execution failed.");
      throw err;
    }
  };

  useEffect(() => {
    syncProtocol();
    priceInterval.current = window.setInterval(() => syncProtocol(), 15000);
    return () => {
      if (priceInterval.current) clearInterval(priceInterval.current);
    };
  }, [syncProtocol]);

  useEffect(() => {
    const { ethereum } = window as any;
    if (ethereum) {
      ethereum.on('accountsChanged', (accounts: string[]) => {
        const addr = accounts[0] || null;
        setAccount(addr);
        syncProtocol(addr);
      });
      ethereum.on('chainChanged', () => window.location.reload());
    }
  }, [syncProtocol]);

  useEffect(() => {
    if (!error) return;
    const timeout = window.setTimeout(() => setError(null), 5000);
    return () => window.clearTimeout(timeout);
  }, [error]);

  if (view === 'landing') {
    return <Landing onEnter={() => setView('app')} />;
  }

  return (
    <div className="flex h-screen bg-[#020617] text-slate-100 overflow-hidden relative">
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        account={account} 
        isSyncing={isSyncing}
        lastSync={lastSyncTime}
        onGoHome={() => setView('landing')}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />
      
      <main className="flex-1 overflow-y-auto p-4 md:p-8 relative">
        <button
          onClick={() => setIsSidebarOpen(true)}
          className="lg:hidden mb-4 inline-flex items-center gap-2 bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-[0.2em]"
        >
          ☰ Menu
        </button>
        <div className="max-w-6xl mx-auto space-y-8">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 p-5 rounded-2xl flex items-center justify-between animate-in fade-in slide-in-from-top-2 z-50">
              <div className="flex items-center gap-4">
                <span className="text-xl">⚠️</span>
                <p className="text-[11px] font-bold text-red-200">{error}</p>
              </div>
              <button onClick={() => setError(null)} className="text-red-400 hover:text-white font-black text-xs px-2">✕</button>
            </div>
          )}

          {!account && (
            <div className="glass-morphism border border-indigo-500/20 bg-indigo-500/[0.03] p-6 rounded-3xl flex flex-col md:flex-row items-center justify-between gap-6 animate-in slide-in-from-top-4">
              <div className="flex items-center gap-5">
                <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-2xl shadow-lg">📡</div>
                <div>
                  <h4 className="text-[11px] font-black text-indigo-400 uppercase tracking-[0.3em]">Protocol Observer Mode</h4>
                  <p className="text-sm font-bold text-white italic">"Transparent Solvency for the Ghanaian Digital Economy."</p>
                  <p className="text-[10px] text-slate-500 font-bold uppercase mt-1 tracking-widest">You are currently viewing live protocol telemetry. To interact with vaults, authorize a Polygon wallet.</p>
                </div>
              </div>
              <button onClick={connectWallet} className="bg-indigo-600 hover:bg-indigo-500 text-white font-black py-4 px-10 rounded-2xl transition-all uppercase tracking-[0.2em] text-[10px] shadow-xl shadow-indigo-600/20 whitespace-nowrap active:scale-95">
                Authorize Account
              </button>
            </div>
          )}

          <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 pt-4">
            <div>
              <div className="flex items-center gap-3">
                 <h1 className="text-2xl font-black tracking-tight text-white uppercase italic">
                  {activeTab === 'dashboard' && 'Market Analytics'}
                  {activeTab === 'vaults' && 'Sovereign Vaults'}
                  {activeTab === 'liquidate' && 'Solvency Engine'}
                  {activeTab === 'ai' && 'AI Risk Advisor'}
                </h1>
                {isSyncing && <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse shadow-[0_0_8px_#6366f1]" />}
              </div>
              <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mt-1">
                Network: <span className="text-emerald-500">Polygon Amoy</span> • Identity: <span className={account ? "text-emerald-500" : "text-amber-500"}>{account ? "Validated Protocol User" : "Anonymous Observer"}</span>
              </p>
            </div>
            
            <div className="flex items-center gap-4">
              {account && (
                <div className="flex items-center gap-3 glass-morphism px-4 py-2.5 rounded-xl border border-white/10">
                  <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center font-black text-[10px] text-white">
                    {account.substring(2, 4).toUpperCase()}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] font-mono font-bold text-white leading-none">{account.substring(0, 6)}...{account.substring(38)}</span>
                    <span className="text-[8px] text-emerald-500 font-black mt-1 uppercase tracking-tighter">Verified Link</span>
                  </div>
                </div>
              )}
            </div>
          </header>

          <div className="animate-in fade-in duration-700">
            {activeTab === 'dashboard' && (
              <Dashboard positions={positions} protocolStats={protocolStats} transactions={transactions} prices={prices} account={account} />
            )}

            {activeTab === 'vaults' && (
              <VaultManager 
                positions={positions} 
                prices={prices} 
                balances={balances} 
                onUpdate={handleAction} 
                isSyncing={isSyncing} 
                account={account}
              />
            )}

            {activeTab === 'liquidate' && (
              <LiquidationHub 
                prices={prices}
                onLiquidate={handleLiquidation}
                isSyncing={isSyncing}
                account={account}
              />
            )}

            {activeTab === 'ai' && (
              <AIAdvisor positions={positions} prices={prices} transactions={transactions} />
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
