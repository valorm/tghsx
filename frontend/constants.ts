
import { CollateralType } from './types';

export const PROTOCOL_ADDRESSES = {
  TGHSX_TOKEN: import.meta.env.VITE_TGHSX_TOKEN_ADDRESS,
  COLLATERAL_VAULT: import.meta.env.VITE_COLLATERAL_VAULT_ADDRESS
};

export const COLLATERAL_ADDRESSES = {
  [CollateralType.WETH]: import.meta.env.VITE_WETH_ADDRESS,
  [CollateralType.WBTC]: import.meta.env.VITE_WBTC_ADDRESS,
  [CollateralType.USDC]: import.meta.env.VITE_USDC_ADDRESS,
  [CollateralType.WMATIC]: '0x13c09eAa18d75947A5426CaeDdEb65922400028c'
};

export const COINGECKO_IDS = {
  [CollateralType.WETH]: 'ethereum',
  [CollateralType.WBTC]: 'wrapped-bitcoin',
  [CollateralType.USDC]: 'usd-coin',
  [CollateralType.WMATIC]: 'matic-network'
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
  [CollateralType.USDC]: 15.5,
  [CollateralType.WMATIC]: 12
};

export const COLLATERAL_ICONS = {
  [CollateralType.WETH]: 'https://cryptologos.cc/logos/ethereum-eth-logo.png',
  [CollateralType.WBTC]: 'https://cryptologos.cc/logos/wrapped-bitcoin-wbtc-logo.png',
  [CollateralType.USDC]: 'https://cryptologos.cc/logos/usd-coin-usdc-logo.png',
  [CollateralType.WMATIC]: 'https://cryptologos.cc/logos/polygon-matic-logo.png'
};
