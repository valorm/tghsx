const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("CollateralVault", function () {
  let deployer, user;
  let tghsx, vault, ethUsdOracle, usdGhsOracle;

  const ETH_USD_PRICE = ethers.utils.parseUnits("2000", 8); // $2000/ETH
  const USD_GHS_PRICE = ethers.utils.parseUnits("15", 8);   // 1 USD = 15 GHS
  const DECIMALS = 8;

  beforeEach(async function () {
    [deployer, user] = await ethers.getSigners();

    // Deploy tGHSX token
    const TGHSXToken = await ethers.getContractFactory("TGHSXToken");
    tghsx = await TGHSXToken.deploy();
    await tghsx.deployed();

    // Deploy Mock Aggregators
    const MockV3Aggregator = await ethers.getContractFactory("MockV3Aggregator");
    ethUsdOracle = await MockV3Aggregator.deploy(ETH_USD_PRICE, DECIMALS, "ETH/USD");
    await ethUsdOracle.deployed();

    usdGhsOracle = await MockV3Aggregator.deploy(USD_GHS_PRICE, DECIMALS, "USD/GHS");
    await usdGhsOracle.deployed();

    // Deploy CollateralVault
    const CollateralVault = await ethers.getContractFactory("CollateralVault");
    vault = await CollateralVault.deploy(
      tghsx.address,
      ethUsdOracle.address,
      usdGhsOracle.address,
       treasury.address
    );
    await vault.deployed();

    // Grant minting rights to CollateralVault
    await tghsx.grantRole(await tghsx.MINTER_ROLE(), vault.address);
  });

  it("should deposit ETH and mint tGHSX if collateral ratio is satisfied", async function () {
    const depositAmount = ethers.utils.parseEther("1"); // 1 ETH
    const expectedGhsPerEth = 2000 * 15; // = 30,000 GHS

    // 150% collateral ratio => max mint = 30000 / 1.5 = 20000 GHS
    const expectedMint = ethers.utils.parseUnits("20000", 18);

    await vault.connect(user).depositAndMint({ value: depositAmount });

    const minted = await tghsx.balanceOf(user.address);
    expect(minted).to.equal(expectedMint);

    const stored = await vault.collateralETH(user.address);
    expect(stored).to.equal(depositAmount);
  });

  it("should burn tGHSX and refund ETH proportionally", async function () {
    const depositAmount = ethers.utils.parseEther("1");
    await vault.connect(user).depositAndMint({ value: depositAmount });

    const minted = await tghsx.balanceOf(user.address);
    await tghsx.connect(user).approve(vault.address, minted);

    const tx = await vault.connect(user).burnTGHSX(minted);
    const receipt = await tx.wait();
    const event = receipt.events.find((e) => e.event === "CollateralWithdrawn");

    expect(event.args.user).to.equal(user.address);
    expect(event.args.ethAmount).to.be.closeTo(depositAmount, ethers.utils.parseEther("0.001"));

    const finalBalance = await vault.collateralETH(user.address);
    expect(finalBalance).to.equal(0);
  });

  it("should fail to mint if collateral is insufficient", async function () {
    // Simulate ETH price crash to $500
    await ethUsdOracle.updateAnswer(ethers.utils.parseUnits("500", 8));

    await expect(
      vault.connect(user).depositAndMint({ value: ethers.utils.parseEther("1") })
    ).to.be.revertedWith("Insufficient collateral");
  });
});
