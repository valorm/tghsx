
import { CollateralType } from './types';

export const PROTOCOL_ADDRESSES = {
  TGHSX_TOKEN: import.meta.env.VITE_TGHSX_TOKEN_ADDRESS,
  COLLATERAL_VAULT: import.meta.env.VITE_COLLATERAL_VAULT_ADDRESS
};

export const COLLATERAL_ADDRESSES = {
  [CollateralType.WETH]: '0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9', 
  [CollateralType.WBTC]: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f',
  [CollateralType.USDC]: '0x41e944041d507c2a1329E28Ef09d5a78ccB98444'
};

export const COINGECKO_IDS = {
  [CollateralType.WETH]: 'ethereum',
  [CollateralType.WBTC]: 'wrapped-bitcoin',
  [CollateralType.USDC]: 'usd-coin'
};

export const SYSTEM_PARAMS = {
  MIN_COLLATERAL_RATIO: 150,
  LIQUIDATION_THRESHOLD: 125,
  LIQUIDATION_PENALTY: 10,
  COOLDOWN_MINUTES: 5,
  TGHSX_DECIMALS: 6
};

export const INITIAL_PRICES: Record<CollateralType, number> = {
  [CollateralType.WETH]: 45000,
  [CollateralType.WBTC]: 950000,
  [CollateralType.USDC]: 15.5
};

export const COLLATERAL_ICONS = {
  [CollateralType.WETH]: 'https://cryptologos.cc/logos/ethereum-eth-logo.png',
  [CollateralType.WBTC]: 'https://cryptologos.cc/logos/wrapped-bitcoin-wbtc-logo.png',
  [CollateralType.USDC]: 'https://cryptologos.cc/logos/usd-coin-usdc-logo.png'
};
