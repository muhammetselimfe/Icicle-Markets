# Icicle Markets

Avalanche blockchain explorer and prediction markets frontend. Browse token prices, swap assets, and trade Icicle Options prediction markets.

## Features

- **Spot Trading** — Browse Avalanche token prices, charts, and swap directly via YAK Router
- **Prediction Markets** — Bet on where asset prices will land using CLMSR-based options (Fuji testnet)
- **Portfolio** — Track holdings, transaction history, and P&L
- **Positions** — View and manage open prediction market positions with real-time P&L
- **Block Explorer** — Live blocks, TPS, validators, and chain stats

## Tech Stack

- **Framework:** React 18 + TypeScript + Vite
- **Blockchain:** wagmi + viem (Avalanche C-Chain & Fuji testnet)
- **Styling:** Tailwind CSS v4 + Radix UI primitives
- **State:** React Query (@tanstack/react-query)
- **Charts:** Recharts + custom SVG price distribution charts
- **Auth:** Privy SDK (email, Google, wallet logins)
- **PWA:** Installable with offline support

## Getting Started

```bash
npm install
npm run dev
```

Requires `VITE_WALLETCONNECT_PROJECT_ID` environment variable.

## Pages

| Route | Description |
|-------|-------------|
| `/` | Token markets with prices, categories, and spot trading |
| `/options` | Prediction markets listing |
| `/options/trade/:id` | Trade a specific prediction market |
| `/positions` | Your prediction market positions and P&L |
| `/portfolio` | Wallet holdings and transaction history |
| `/explorer` | Live blocks, TPS, and validators |

## Prediction Markets

Icicle Options implements [CLMSR (Continuous Logarithmic Market Scoring Rule)](https://docs.signals.wtf/docs/whitepaper) — an automated market maker designed for continuous-outcome prediction markets.

### How It Works

Traditional prediction markets use binary YES/NO outcomes or peer-to-peer orderbooks. These break down for continuous variables like asset prices, because liquidity fragments across too many possible outcomes. CLMSR solves this with a single cost function that prices all outcomes simultaneously.

**1. Market Structure**

Each market defines a price range for an asset (e.g., AVAX $7.00–$11.00) divided into discrete **bins** — small price intervals (e.g., $0.05 wide). A market might have 80–100 bins covering the expected price range. Each bin represents the outcome "the asset's price lands in this interval at settlement."

**2. CLMSR Pricing Engine**

Instead of matching buyers and sellers, a single cost function `C(q) = α × ln Z(q)` prices every bin at once. The key properties:

- **Unified liquidity** — One equation prices all bins and arbitrary ranges simultaneously. No fragmented orderbooks.
- **Dynamic pricing** — As traders buy into a bin, its price (implied probability) rises and other bins' prices fall, always summing to 100%.
- **Path independence** — The cost of moving from state A to state B is the same regardless of the order of intermediate trades.
- **Bounded maker loss** — The worst-case loss for the market maker is mathematically bounded by `α × ln(n)`, where `n` is the number of bins and `α` is the liquidity depth parameter.

**3. Trading**

Users buy positions in one or more bins (a price range) they believe the asset will land in. The cost is determined by the CLMSR cost function — buying into popular bins costs more because their implied probability is higher. Each position is minted as an **ERC-721 NFT**.

**4. Settlement**

When the market closes, a [Redstone oracle](https://redstone.finance/) provides the actual asset price. The oracle price maps to a winning bin, and users holding positions in that bin can claim their payout. Positions in losing bins expire worthless.

### Market Example

```
Asset:        AVAX
Price range:  $7.00 – $11.00
Tick spacing: $0.05 per bin
Bins:         80
Duration:     24 hours
```

A trader who thinks AVAX will be between $8.50–$9.00 buys that 10-bin range. If AVAX settles at $8.72, the winning bin is $8.70–$8.75, and positions covering that bin pay out.

### Architecture

- **On-chain contracts** — UUPS upgradeable core with 5 delegate modules (Trade, MarketLifecycle, Oracle, LPVault, Risk)
- **LP Vault** — Maker capital is pooled from liquidity providers who earn trading fees in exchange for underwriting market risk
- **Safety Layer** — Enforces solvency invariants: bounded depth via entropy budgets, daily drawdown floor via Backstop Grants, withdrawal lag to prevent bank runs
- **Fee Waterfall** — A fixed-priority system that splits gross fees across loss compensation, Backstop reserves, LP returns, and protocol Treasury

Smart contracts: [Icicle-Markets-Contracts](https://github.com/muhammetselimfe/Icicle-Markets-Contracts)

Based on [Signals Protocol](https://github.com/signals-protocol/v1-contract) (MIT License).

## Build

```bash
npm run build        # Production build
npm run test         # Run tests
npm run test:watch   # Watch mode
```

## License

MIT
