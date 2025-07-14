const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("TGHSXToken", function () {
  let token, owner, addr1, addr2, vault;
  const MINTER_BURNER_ROLE = ethers.utils.keccak256(
    ethers.utils.toUtf8Bytes("MINTER_BURNER_ROLE")
  );

  beforeEach(async () => {
    [owner, addr1, addr2, vault] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("TGHSXToken");
    token = await Token.deploy();
    await token.deployed();

    await token.grantRole(MINTER_BURNER_ROLE, vault.address);
  });

  it("should assign admin role to deployer", async () => {
    expect(await token.hasRole(await token.DEFAULT_ADMIN_ROLE(), owner.address)).to.be.true;
  });

  it("should mint tokens when caller has MINTER_BURNER_ROLE", async () => {
    await token.connect(vault).mint(addr1.address, 1000);
    expect(await token.balanceOf(addr1.address)).to.equal(1000);
  });

it("should fail minting if not authorized", async () => {
  await expect(
    token.connect(addr1).mint(addr2.address, 1000)
  ).to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount");
});


  it("should prevent minting 0 tokens", async () => {
    await expect(token.connect(vault).mint(addr1.address, 0)).to.be.revertedWithCustomError(
      token, "InvalidAmount"
    );
  });

  it("should burn tokens via roleBurn", async () => {
    await token.connect(vault).mint(addr1.address, 500);
    await token.connect(vault).roleBurn(addr1.address, 300);
    expect(await token.balanceOf(addr1.address)).to.equal(200);
  });

  it("should allow burnFrom by MINTER_BURNER_ROLE without approval", async () => {
    await token.connect(vault).mint(addr1.address, 500);
    await token.connect(vault).burnFrom(addr1.address, 100);
    expect(await token.balanceOf(addr1.address)).to.equal(400);
  });

  it("should allow standard burnFrom with approval", async () => {
    await token.connect(vault).mint(addr1.address, 500);
    await token.connect(addr1).approve(addr2.address, 200);
    await token.connect(addr2).burnFrom(addr1.address, 200);
    expect(await token.balanceOf(addr1.address)).to.equal(300);
  });

  it("should prevent burning 0 tokens", async () => {
    await expect(token.connect(vault).roleBurn(addr1.address, 0)).to.be.revertedWithCustomError(
      token, "InvalidAmount"
    );
  });

  it("should allow users to burn their own tokens", async () => {
    await token.connect(vault).mint(addr1.address, 100);
    await token.connect(addr1).burn(100);
    expect(await token.balanceOf(addr1.address)).to.equal(0);
  });

  it("should toggle emergency stop", async () => {
    await token.connect(owner).toggleEmergencyStop(true);
    expect(await token.emergencyStop()).to.equal(true);
  });

  it("should block minting during emergency stop", async () => {
    await token.connect(owner).toggleEmergencyStop(true);
    await expect(token.connect(vault).mint(addr1.address, 100)).to.be.revertedWithCustomError(
      token, "EmergencyStopActive"
    );
  });

  it("should block transfer during emergency stop", async () => {
    await token.connect(vault).mint(addr1.address, 100);
    await token.connect(owner).toggleEmergencyStop(true);
    await expect(token.connect(addr1).transfer(addr2.address, 50)).to.be.revertedWithCustomError(
      token, "EmergencyStopActive"
    );
  });

  it("should allow role revocation by admin", async () => {
    await token.connect(owner).revokeRole(MINTER_BURNER_ROLE, vault.address);
    expect(await token.hasRole(MINTER_BURNER_ROLE, vault.address)).to.be.false;
  });

  it("should respect decimals override", async () => {
    expect(await token.decimals()).to.equal(18);
  });
});
