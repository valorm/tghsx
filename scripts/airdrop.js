const { ethers } = require("hardhat");

async function main() {
  const tokenAddress = "0xb04093d34F5feC6DE685B8684F3e2086dd866a50";
  const [deployer] = await ethers.getSigners();

  const TGHSX = await ethers.getContractAt("TGHSXToken", tokenAddress);

const airdropListRaw = [
  { address: "0x37c6aa9328c616cd339dba0b3bb75ccad19c31c5", amount: "100" },
  { address: "0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B", amount: "150" },
  { address: "0x1db3439a222c519ab44bb1144fc28167b4fa6ee6", amount: "75" },
  // other addresses...
];

// Ethers will compute the correct checksum automatically.
const airdropList = airdropListRaw.map((entry) => ({
  address: ethers.utils.getAddress(entry.address.trim()),
  amount: entry.amount,
}));


  for (const recipient of airdropList) {
    try {
      const normalizedAddress = ethers.utils.getAddress(recipient.address); // Validates checksum
      const tokenAmount = ethers.utils.parseUnits(recipient.amount, 2); // Assuming 2 decimals

      const tx = await TGHSX.transfer(normalizedAddress, tokenAmount);
      console.log(`✅ Sent ${recipient.amount} tGHSX to ${normalizedAddress}. Tx: ${tx.hash}`);
      await tx.wait();
    } catch (err) {
      console.error(`❌ Error sending to ${recipient.address}: ${err.message}`);
    }
  }

  console.log("🎉 Airdrop complete.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
