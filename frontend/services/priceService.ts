
import { CollateralType } from '../types';
import { COINGECKO_IDS, INITIAL_PRICES } from '../constants';

export const fetchLivePrices = async (): Promise<Record<CollateralType, number>> => {
  try {
    const ids = Object.values(COINGECKO_IDS).join(',');
    const response = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=ghs`
    );
    
    if (!response.ok) throw new Error('Price API unreachable');
    
    const data = await response.json();
    
    return {
      [CollateralType.WETH]: data['ethereum']?.ghs || INITIAL_PRICES[CollateralType.WETH],
      [CollateralType.WBTC]: data['wrapped-bitcoin']?.ghs || INITIAL_PRICES[CollateralType.WBTC],
      [CollateralType.USDC]: data['usd-coin']?.ghs || INITIAL_PRICES[CollateralType.USDC],
      [CollateralType.WMATIC]: data['matic-network']?.ghs || INITIAL_PRICES[CollateralType.WMATIC]
    };
  } catch (error) {
    console.warn('Failed to fetch live prices, using initial values:', error);
    return INITIAL_PRICES;
  }
};
