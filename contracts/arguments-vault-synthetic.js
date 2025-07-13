// arguments-vault-synthetic.js
const { ethers } = require("ethers");

module.exports = [
  "0x3B32a9E72C9C2f195089E59d2e1F0F31D8A8415A", // 1. TGHSXToken address
  "0x5048Be7D1C89BDbb6f11D3e668fE01BC805DE446", // 2. Mock ETH/BTC feed address
  "0x5D492ADBee66504ba9F5d57C8f5B424aefa3D4cb", // 3. Mock BTC/USD feed address
  "0x1a0312B0453507CC412012Cc699f8d64d8219aeE", // 4. Treasury address (your wallet)
  ethers.utils.parseUnits("10.4167", 8).toString()  // 5. Initial GHS price
];