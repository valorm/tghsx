# tGHSX Protocol

![tGHSX Logo](/frontend/logo.png)

**The Synthetic Ghanaian Cedi, backed by Crypto.**

tGHSX is a decentralized finance (DeFi) protocol that allows users to mint `tGHSX`, a synthetic stablecoin pegged 1:1 to the Ghanaian Cedi (GH₵). Users can lock Ethereum (ETH) as collateral in a smart contract vault to mint tGHSX. The protocol is built on the Polygon blockchain and utilizes Chainlink oracles for reliable price data.

---

## Core Features

* **Minting & Vault Management**: Users can connect their Web3 wallet, deposit ETH collateral, and mint tGHSX tokens.
* **Collateral Monitoring**: Shows users their vault's health, including collateralization ratio and liquidation price.
* **Repay & Withdraw**: Users can repay their tGHSX debt to withdraw their ETH collateral at any time.
* **Liquidations**: Displays undercollateralized vaults, allowing anyone to liquidate them to ensure protocol solvency and earn a bonus.
* **Protocol Analytics**: Displays key system health metrics like Total Value Locked (TVL), total debt, and the number of active vaults.
* **Admin Dashboard**: A secure, role-based dashboard for administrators to approve minting requests and manage the protocol's state (e.g., emergency pause/resume).

## Architecture Overview

The tGHSX Protocol is composed of four main components that work together: a vanilla JS frontend, a FastAPI backend, Solidity smart contracts, and a Supabase database.



## License

This project is licensed under the MIT License. See the `LICENSE` file for details.
