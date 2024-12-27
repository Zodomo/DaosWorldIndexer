# DaosWorld Token Holder Indexer and Weighted Random Winner Selector

A TypeScript utility for analyzing token holders and selecting weighted random winners across multiple ERC20 tokens and their associated Uniswap V3 LP positions.

## Features

- 📊 Fetch all token transfers for specified ERC20 tokens
- 🏊‍♂️ Track Uniswap V3 LP positions and balances
- 💰 Calculate accurate token holder balances at specific block numbers
- 🎲 Select random winners weighted by both token holdings and LP positions
- 📑 All functions can export data to disk

## Usage

```typescript
import { DaosWorldIndexer } from "daosworld-token-utility";

// Initialize the indexer with your Alchemy API key and token configurations
const indexer = new DaosWorldIndexer({
  alchemyApiKey: "your-alchemy-api-key",
  tokens: [
    {
      address: "0x...", // Token contract address
      lpAddress: "0x...", // Uniswap V3 pool address
    },
  ],
  logging: true, // Optional: Enable performance logging
});

// Get all token transfers up to a specific block
const transfers = await indexer.getTransfers(blockNumber, "transfers.csv");

// Get all LP positions and holders
const lpHolders = await indexer.getLPHolders(blockNumber, "lp-holders.json");

// Get detailed LP balances
const lpBalances = await indexer.getLPBalances(blockNumber, "lp-balances.csv");

// Get complete balance snapshot (tokens + LP positions)
const snapshot = await indexer.getBalanceSnapshot(
  blockNumber,
  true,
  "snapshot.csv"
);

// Select random winners with custom LP position weighting
const winners = await indexer.getRandomWinners(
  blockNumber,
  1.5, // LP weight multiplier (0 to disable LP consideration)
  5, // Number of winners
  "winners.csv"
);
```

## Token Configuration

Each token in the configuration requires:

- `address`: The ERC20 token contract address
- `lpAddress`: The Uniswap V3 pool address for the token

## Features in Detail

- **Transfer Analysis**: Comprehensive token transfer history tracking
- **LP Position Tracking**: Full Uniswap V3 position tracking including current liquidity
- **Balance Calculation**: Accurate holder balances for both tokens and LP positions
- **Weighted Random Selection**: Winners selected based on configurable weights for tokens and LP positions
- **Rate Limiting**: Built-in rate limiting and retry logic for API calls
- **Export Data**: All functions support exporting their data to disk
- **Performance Logging**: Optional timing metrics for all operations

## Requirements

- Alchemy API key with access to Base network
- Node
- Typescript
