# DaosWorld Token Holder Indexer and Weighted Random Winner Selector

A TypeScript utility for analyzing token holders and selecting weighted random winners across multiple ERC20 tokens launched by Daos.World.

## Features

- 📊 Fetch all token transfers for specified ERC20 tokens
- 💰 Calculate accurate token holder balances at specific block numbers
- 🎲 Select random winners weighted by their total token holdings
- 📑 Export winner data to CSV format

## Usage

```typescript
import { DaosWorldIndexer } from "daosworld-token-utility";

// Initialize the indexer with your Alchemy API key and token configurations
const indexer = new DaosWorldIndexer({
  alchemyApiKey: "your-alchemy-api-key",
  tokens: [
    {
      address: "0x...", // Token contract address
      blockNumber: 1234567, // Snapshot block number
      lpAddress: "0x...", // LP address to exclude from holdings
    },
  ],
});

/// None of these methods have to be executed in sequential order.

// Get all token transfers
const transfers = await indexer.getTransfers();

// Get holder balances
const balances = await indexer.getBalances();

// Select 5 random winners weighted by their holdings
const winners = await indexer.getRandomWinners(5);

// Export winners to CSV
await indexer.exportRandomWinners(5);
```

## Token Configuration

Each token in the configuration requires:

- `address`: The ERC20 token contract address
- `blockNumber`: The block number to snapshot holder balances
- `lpAddress`: The liquidity pool address to exclude from holder calculations

## Features in Detail

- **Transfer Analysis**: Fetches and analyzes all token transfers up to specified block numbers
- **Balance Calculation**: Accurately computes holder balances while excluding LP addresses
- **Weighted Random Selection**: Selects winners based on their proportional token holdings
- **Rate Limiting**: Includes built-in rate limiting and retry logic for API calls
- **CSV Export**: Exports winner data including addresses and token balances

## Requirements

- Alchemy API key
- Node
