import { ethers } from "hardhat";
import "dotenv/config";

async function main() {
  // 1. Get the address you want to grant the role to from your .env file
  const minterAccountAddress = process.env.MINTER_ACCOUNT_ADDRESS;
  const tghsxTokenAddress = process.env.TGHSX_TOKEN_ADDRESS;

  if (!minterAccountAddress || !tghsxTokenAddress) {
    throw new Error("Please define MINTER_ACCOUNT_ADDRESS and TGHSX_TOKEN_ADDRESS in your .env file");
  }

  console.log(`Attaching to TGHSXToken contract at: ${tghsxTokenAddress}`);

  // 2. Get the deployed instance of the TGHSXToken contract
  const tghsxToken = await ethers.getContractAt("TGHSXToken", tghsxTokenAddress);

  // 3. Get the role identifier from the contract
  const MINTER_BURNER_ROLE = await tghsxToken.MINTER_BURNER_ROLE();

  console.log(`Granting MINTER_BURNER_ROLE to account: ${minterAccountAddress}...`);

  // 4. Call the grantRole function and wait for the transaction to be confirmed
  //    The account running this script MUST be the contract owner.
  const tx = await tghsxToken.grantRole(MINTER_BURNER_ROLE, minterAccountAddress);
  await tx.wait();

  console.log("✅ Role granted successfully!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});