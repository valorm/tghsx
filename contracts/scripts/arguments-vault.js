// arguments-vault.js
const { ethers } = require("ethers");

module.exports = [
  "0x406B04FDD3A5315552254ccCB69E81372E59E7D7",      // 1. TGHSXToken address
  "0x0715A7794a1dc8e42615F059dD6e406A6594651A", // 2. Live ETH/USD feed address
  "0x1a0312B0453507CC412012Cc699f8d64d8219aeE",     // 3. Treasury address (your wallet)
  ethers.utils.parseUnits("10.39", 8).toString() // 4. Initial GHS price
];
