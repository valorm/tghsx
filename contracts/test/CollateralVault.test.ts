import { ethers } from "hardhat";
import { expect } from "chai";
import { CollateralVault, TGHSXToken, MockV3Aggregator } from "../typechain-types";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

describe("CollateralVault", function () {
  let owner: SignerWithAddress;
  let user2: SignerWithAddress;
  let collateralVault: CollateralVault;
  let tghsxToken: TGHSXToken;
  let mockEthUsdPriceFeed: MockV3Aggregator;
  
  beforeEach(async function () {
    [owner, user2] = await ethers.getSigners();

    const MockAggregatorFactory = await ethers.getContractFactory("MockV3Aggregator");
    mockEthUsdPriceFeed = await MockAggregatorFactory.deploy(ethers.utils.parseUnits("2500", 8), 8, "ETH/USD Mock");
    const mockUsdGhsPriceFeed = await MockAggregatorFactory.deploy(ethers.utils.parseUnits("10.35", 8), 8, "USD/GHS Mock");
    
    const TGHSXTokenFactory = await ethers.getContractFactory("TGHSXToken");
    tghsxToken = await TGHSXTokenFactory.deploy();

    const CollateralVaultFactory = await ethers.getContractFactory("CollateralVault");
    collateralVault = await CollateralVaultFactory.deploy(
      tghsxToken.address,
      mockEthUsdPriceFeed.address,
      mockUsdGhsPriceFeed.address,
      owner.address
    );
    
    const MINTER_BURNER_ROLE = await tghsxToken.MINTER_BURNER_ROLE();
    await tghsxToken.grantRole(MINTER_BURNER_ROLE, collateralVault.address);
  });

  describe("Deposit, Mint, Repay, and Withdraw", function () {
    it("Should allow a user to deposit ETH, mint tGHSX, repay the debt, and withdraw the ETH", async function () {
      const depositAmount = ethers.utils.parseEther("2.0");
      const mintAmount = ethers.utils.parseUnits("15000", 18);

      await collateralVault.connect(owner).depositAndMint(mintAmount, { value: depositAmount });

      expect(await collateralVault.getUserCollateral(owner.address)).to.equal(depositAmount);
      expect(await collateralVault.getUserDebt(owner.address)).to.equal(mintAmount);

      const repayAmount = mintAmount.div(2);
      await tghsxToken.connect(owner).approve(collateralVault.address, repayAmount);
      await collateralVault.connect(owner).burnTGHSX(repayAmount);

      expect(await collateralVault.getUserDebt(owner.address)).to.equal(repayAmount);

      const withdrawAmount = depositAmount.div(2);
      await expect(() => 
        collateralVault.connect(owner).withdraw(withdrawAmount)
      ).to.changeEtherBalance(owner, withdrawAmount);
      
      expect(await collateralVault.getUserCollateral(owner.address)).to.equal(withdrawAmount);
    });
  });
  
  describe("Liquidation", function () {
    it("Should allow a liquidator to liquidate an under-collateralized vault", async function () {
      const depositAmount = ethers.utils.parseEther("1.0");
      const mintAmount = ethers.utils.parseUnits("15000", 18);
      await collateralVault.connect(owner).depositAndMint(mintAmount, { value: depositAmount });
      
      await collateralVault.connect(user2).depositAndMint(ethers.utils.parseUnits("10000", 18), { value: ethers.utils.parseEther("1.0") });
      
      await mockEthUsdPriceFeed.updateAnswer(ethers.utils.parseUnits("1400", 8));
      
      const ratio = await collateralVault.getCollateralizationRatio(owner.address);
      const liquidationRatio = (await collateralVault.vaultConfig()).liquidationRatio;
      expect(ratio).to.be.lt(liquidationRatio);
      
      const debtToRepay = mintAmount.div(2);
      const liquidatorTghsxBalance = await tghsxToken.balanceOf(user2.address);
      await tghsxToken.connect(user2).approve(collateralVault.address, liquidatorTghsxBalance);

      // CORRECTED: Dynamically calculate the expected ETH the liquidator will receive
      const ethGhsPrice = await collateralVault.getEthGhsPrice();
      const PRICE_PRECISION = await collateralVault.PRICE_PRECISION();
      const LIQUIDATION_BONUS = await collateralVault.LIQUIDATION_BONUS();
      const RATIO_PRECISION = await collateralVault.RATIO_PRECISION();

      const liquidatedETH = debtToRepay.mul(PRICE_PRECISION).div(ethGhsPrice);
      const bonus = liquidatedETH.mul(LIQUIDATION_BONUS).div(RATIO_PRECISION);
      const expectedEthToReceive = liquidatedETH.add(bonus);

      // Use the dynamically calculated value in the assertion
      await expect(
  collateralVault.connect(user2).liquidateVault(owner.address, debtToRepay)
).to.changeEtherBalance(user2, expectedEthToReceive);

      expect(await collateralVault.getUserDebt(owner.address)).to.equal(debtToRepay);
    });
  });

  describe("Failure Cases", function () {
    it("Should revert if trying to mint with insufficient collateral ratio", async function () {
        const depositAmount = ethers.utils.parseEther("1.0");
        const mintAmount = ethers.utils.parseUnits("20000", 18); 
        
        await expect(
            collateralVault.depositAndMint(mintAmount, { value: depositAmount })
        ).to.be.revertedWithCustomError(collateralVault, "VaultUndercollateralized");
    });
      
    it("Should revert when withdrawing collateral that makes the vault unhealthy", async function () {
      const depositAmount = ethers.utils.parseEther("1.0");
      const mintAmount = ethers.utils.parseUnits("10000", 18);
      await collateralVault.depositAndMint(mintAmount, { value: depositAmount });
      
      const withdrawAmount = ethers.utils.parseEther("0.9");
      
      await expect(
          collateralVault.withdraw(withdrawAmount)
      ).to.be.revertedWithCustomError(collateralVault, "VaultUndercollateralized");
    });
      
    it("Should prevent non-owners from calling owner-only functions", async function () {
      await expect(
          collateralVault.connect(user2).emergencyPause()
      ).to.be.revertedWithCustomError(collateralVault, "UnauthorizedEmergencyAction");
    });
  });
});