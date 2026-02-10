
export enum CollateralType {
  WETH = 'WETH',
  WBTC = 'WBTC',
  USDC = 'USDC'
}

export interface UserPosition {
  collateralType: CollateralType;
  depositedAmount: number;
  mintedDebt: number; // in tGHSX
  collateralValueGHS: number;
  healthFactor: number; // (Value / Debt) * 100
}

export interface Transaction {
  id: string;
  type: 'deposit' | 'withdraw' | 'mint' | 'burn' | 'liquidate';
  asset: string;
  amount: number;
  timestamp: number;
  txHash: string;
}

export type ActiveTab = 'dashboard' | 'vaults' | 'liquidate' | 'ai';

export interface ProtocolStats {
  globalTVL: number;
  globalDebt: number;
  userTVL: number;
  userDebt: number;
  liquidationThreshold: number;
  minCollateralRatio: number;
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}
