# tGHSX Stablecoin Protocol Documentation

**Version:** 1.1
**Network:** Polygon Amoy Testnet

---

## 1. Introduction: What is tGHSX?

tGHSX is a decentralized finance (DeFi) stablecoin protocol designed to provide GHS-pegged liquidity backed by crypto assets. Users lock up collateral (e.g., WETH, WBTC, USDC) in a smart contract vault and mint tGHSX tokens, soft-pegged to the Ghanaian Cedi (GHS). The protocol enables users to unlock liquidity without selling their assets.

**Key Features:**

* Overcollateralized stablecoin (150% minimum ratio)
* Liquidation mechanisms for undercollateralized positions
* Designed for decentralization, capital efficiency, and security

---

## 2. For End-Users: How to Use the Protocol

### Step 1: Deposit Collateral

Deposit approved collateral into the `CollateralVault` contract.

**Action:** Call `depositCollateral(collateral, amount)`
**Example:** Deposit 1 WETH into the vault.

---

### Step 2: Mint tGHSX Stablecoins

Mint tGHSX based on the value of your collateral and the protocol's Minimum Collateralization Ratio (150%).

**Action:** Call `mintTokens(collateral, amount)`
**Example:** If 1 WETH = 45,000 GHS, you can mint up to 30,000 tGHSX (45,000 / 1.5). Mint less to reduce liquidation risk.

---

### Step 3: Repay and Withdraw Collateral

Burn tGHSX to repay your debt and unlock your collateral.

**Burn Tokens:** Call `burnTokens(collateral, amount)`
**Withdraw Collateral:** Call `withdrawCollateral(collateral, amount)`

---

### What is Liquidation?

**Trigger:** If your collateral ratio falls below the Liquidation Threshold (125%)
**Outcome:** A liquidator repays your debt and receives your collateral at a 10% discount
**Purpose:** Ensures every tGHSX remains backed by sufficient collateral

---

## 3. For Developers: Technical Deep Dive

### Smart Contracts

* **TGHSXToken.sol** – ERC20 contract representing tGHSX
* **CollateralVault.sol** – Core contract for collateral, minting, burning, and liquidation

---

### Contract: TGHSXToken.sol

* **Standard:** ERC20, ERC20Burnable
* **Decimals:** 6

**Roles:**

* `MINTER_BURNER_ROLE`: Granted to `CollateralVault`
* `EMERGENCY_ROLE`: For protocol pause actions

---

### Contract: CollateralVault.sol

Manages protocol logic and user interactions.

**Roles:**

* `VAULT_ADMIN_ROLE`: Adjusts parameters and adds collaterals
* `LIQUIDATOR_ROLE`: Can liquidate unsafe positions
* `ORACLE_ROLE`: Updates collateral price feeds

**Core Functions:**

* `depositCollateral(address collateral, uint256 amount)`
* `withdrawCollateral(address collateral, uint256 amount)`
* `mintTokens(address collateral, uint256 amount)`
* `burnTokens(address collateral, uint256 amount)`

**View Functions:**

* `getUserPosition(address user, address collateral)`
* `getVaultStatus()`

**Liquidation Logic:**

* `liquidate(address user, address collateral)`

  * Checks if position < 125%
  * Liquidator repays debt, receives collateral + 10% bonus

---

### Deployed Contracts on Polygon Amoy

* **TGHSXToken:** `0x7aD3121876c4F8104F3703efe3034CE632974943`
* **CollateralVault:** `0x8dc1E1E376E5f105Ee22b6a20F943bbd897e192B`

---

## 4. Key System Parameters

| Parameter                | Value     | Description                             |
| ------------------------ | --------- | --------------------------------------- |
| Minimum Collateral Ratio | 150%      | Required to mint tGHSX                  |
| Liquidation Threshold    | 125%      | Below this, positions can be liquidated |
| Liquidation Penalty      | 10%       | Discount for liquidators                |
| Cooldown                 | 5 minutes | Minimum time between mint operations    |

---

For more details, visit: [https://tghsx.vercel.app](https://tghsx.vercel.app)

Join the community:
Telegram: [https://t.me/tghsstablecoin](https://t.me/tghsstablecoin)
X (Twitter): [https://x.com/tokenGHC](https://x.com/tokenGHC)
Discord: [https://discord.com/invite/NPtrctnJhu](https://discord.com/invite/NPtrctnJhu)

---

*Built for decentralized liquidity in Ghana.*
