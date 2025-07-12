// arguments-vault-synthetic.js
const { ethers } = require("ethers");

module.exports = [
  "0xbC1373FFf96147ec0aD1576Aa0e60d065646944A", // 1. TGHSXToken address
  "0x99b8d041836755b7999F2E95a3F16cBe6d6a01eF", // 2. Mock ETH/BTC feed address
  "0x43798b2E29Bd81BE1cDd5D643b0684C9d136E774", // 3. Mock BTC/USD feed address
  "0x1a0312B0453507CC412012Cc699f8d64d8219aeE", // 4. Treasury address 
  ethers.utils.parseUnits("10.39", 8).toString()  // 5. Initial GHS price
];
