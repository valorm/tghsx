
import { ethers } from 'ethers';
import { PROTOCOL_ADDRESSES, COLLATERAL_ADDRESSES } from '../constants';
import { CollateralType } from '../types';

const VAULT_ABI = [
  "function depositCollateral(address collateral, uint256 amount) public",
  "function depositNativeCollateral() public payable",
  "function withdrawCollateral(address collateral, uint256 amount) public",
  "function withdrawNativeCollateral(uint256 amount) public",
  "function mintTokens(address collateral, uint256 amount) public",
  "function burnTokens(address collateral, uint256 amount) public",
  "function liquidate(address user, address collateral) public",
  "function getUserPosition(address user, address collateral) public view returns (uint256 collateralAmount, uint256 mintedAmount, uint256 collateralValue, uint256 collateralRatio, bool isLiquidatable, uint256 lastUpdateTime)",
  "function getVaultStatus() public view returns (uint256 totalMinted, uint256 dailyMinted, uint256 globalDailyRemaining, bool autoMintActive, bool contractPaused, uint256 totalCollateralTypes)"
];

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) public returns (bool)",
  "function allowance(address owner, address spender) public view returns (uint256)",
  "function balanceOf(address account) public view returns (uint256)",
  "function decimals() public view returns (uint8)"
];

export class ContractService {
  private provider: ethers.BrowserProvider | null = null;
  private signer: ethers.JsonRpcSigner | null = null;

  constructor() {
    this.initProvider();
  }

  private initProvider() {
    const { ethereum } = window as any;
    if (ethereum) {
      this.provider = new ethers.BrowserProvider(ethereum);
    }
  }

  async connect() {
    const { ethereum } = window as any;
    if (!ethereum) throw new Error("No Web3 Provider detected.");
    if (!this.provider) this.provider = new ethers.BrowserProvider(ethereum);

    try {
      this.signer = await this.provider.getSigner();
      return await this.signer.getAddress();
    } catch (err) {
      throw new Error("Wallet connection required.");
    }
  }

  async getVaultStats() {
    if (!this.provider) return { totalCollateral: 0, totalDebt: 0 };
    try {
      const vault = new ethers.Contract(PROTOCOL_ADDRESSES.COLLATERAL_VAULT, VAULT_ABI, this.provider);
      const [totalMinted] = await vault.getVaultStatus();
      return {
        totalCollateral: 0,
        totalDebt: parseFloat(ethers.formatUnits(totalMinted, 6))
      };
    } catch (err) {
      console.warn("Global stats unavailable:", err);
      return { totalCollateral: 0, totalDebt: 0 };
    }
  }

  async getAllowance(userAddress: string, type: CollateralType, isDebtToken: boolean = false) {
    if (!this.provider) return BigInt(0);
    const assetAddress = isDebtToken ? PROTOCOL_ADDRESSES.TGHSX_TOKEN : COLLATERAL_ADDRESSES[type];
    const token = new ethers.Contract(assetAddress, ERC20_ABI, this.provider);
    return await token.allowance(userAddress, PROTOCOL_ADDRESSES.COLLATERAL_VAULT);
  }

  async approve(type: CollateralType, isDebtToken: boolean = false) {
    if (!this.signer) throw new Error("Reconnect wallet.");
    const assetAddress = isDebtToken ? PROTOCOL_ADDRESSES.TGHSX_TOKEN : COLLATERAL_ADDRESSES[type];
    const token = new ethers.Contract(assetAddress, ERC20_ABI, this.signer);
    const tx = await token.approve(PROTOCOL_ADDRESSES.COLLATERAL_VAULT, ethers.MaxUint256);
    return await tx.wait();
  }

  async getTokenBalance(userAddress: string, type: CollateralType) {
    if (!this.provider) return 0;
    try {
      if (type === CollateralType.WETH) {
        const balance = await this.provider.getBalance(userAddress);
        return parseFloat(ethers.formatEther(balance));
      }

      const assetAddress = COLLATERAL_ADDRESSES[type];
      const token = new ethers.Contract(assetAddress, ERC20_ABI, this.provider);
      const balance = await token.balanceOf(userAddress);
      return parseFloat(ethers.formatUnits(balance, type === CollateralType.USDC ? 6 : 18));
    } catch (err) {
      return 0;
    }
  }

  async getPosition(userAddress: string, type: CollateralType) {
    if (!this.provider) return { depositedAmount: 0, mintedDebt: 0 };
    try {
      const vault = new ethers.Contract(PROTOCOL_ADDRESSES.COLLATERAL_VAULT, VAULT_ABI, this.provider);
      const assetAddress = COLLATERAL_ADDRESSES[type];
      const [deposited, debt] = await vault.getUserPosition(userAddress, assetAddress);
      
      return {
        depositedAmount: parseFloat(ethers.formatUnits(deposited, 18)),
        mintedDebt: parseFloat(ethers.formatUnits(debt, 6))
      };
    } catch (err) {
      return { depositedAmount: 0, mintedDebt: 0 };
    }
  }

  async deposit(type: CollateralType, amount: number) {
    if (!this.signer) throw new Error("Reconnect wallet.");
    const vault = new ethers.Contract(PROTOCOL_ADDRESSES.COLLATERAL_VAULT, VAULT_ABI, this.signer);

    if (type === CollateralType.WETH) {
      const tx = await vault.depositNativeCollateral({ value: ethers.parseEther(amount.toString()) });
      return await tx.wait();
    }

    const assetAddress = COLLATERAL_ADDRESSES[type];
    const decimals = type === CollateralType.USDC ? 6 : 18;
    const tx = await vault.depositCollateral(assetAddress, ethers.parseUnits(amount.toString(), decimals));
    return await tx.wait();
  }

  async withdraw(type: CollateralType, amount: number) {
    if (!this.signer) throw new Error("Reconnect wallet.");
    const vault = new ethers.Contract(PROTOCOL_ADDRESSES.COLLATERAL_VAULT, VAULT_ABI, this.signer);

    if (type === CollateralType.WETH) {
      const tx = await vault.withdrawNativeCollateral(ethers.parseEther(amount.toString()));
      return await tx.wait();
    }

    const assetAddress = COLLATERAL_ADDRESSES[type];
    const decimals = type === CollateralType.USDC ? 6 : 18;
    const tx = await vault.withdrawCollateral(assetAddress, ethers.parseUnits(amount.toString(), decimals));
    return await tx.wait();
  }

  async mint(type: CollateralType, amount: number) {
    if (!this.signer) throw new Error("Reconnect wallet.");
    const vault = new ethers.Contract(PROTOCOL_ADDRESSES.COLLATERAL_VAULT, VAULT_ABI, this.signer);
    const assetAddress = COLLATERAL_ADDRESSES[type];
    const tx = await vault.mintTokens(assetAddress, ethers.parseUnits(amount.toString(), 6));
    return await tx.wait();
  }

  async burn(type: CollateralType, amount: number) {
    if (!this.signer) throw new Error("Reconnect wallet.");
    const vault = new ethers.Contract(PROTOCOL_ADDRESSES.COLLATERAL_VAULT, VAULT_ABI, this.signer);
    const assetAddress = COLLATERAL_ADDRESSES[type];
    const tx = await vault.burnTokens(assetAddress, ethers.parseUnits(amount.toString(), 6));
    return await tx.wait();
  }

  async liquidate(targetUser: string, type: CollateralType) {
    if (!this.signer) throw new Error("Reconnect wallet.");
    const vault = new ethers.Contract(PROTOCOL_ADDRESSES.COLLATERAL_VAULT, VAULT_ABI, this.signer);
    const assetAddress = COLLATERAL_ADDRESSES[type];
    const tx = await vault.liquidate(targetUser, assetAddress);
    return await tx.wait();
  }
}

export const contractService = new ContractService();
