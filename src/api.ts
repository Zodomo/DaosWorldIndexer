import { Alchemy, AssetTransfersCategory, Network } from "alchemy-sdk";
import type { Token, Balance, Winner } from "./types";
import * as fs from "fs";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const getAlchemy = async (apiKey: string) => {
  const config = {
    apiKey: apiKey,
    network: Network.BASE_MAINNET,
  };
  const alchemy = new Alchemy(config);
  return alchemy;
};

export const getAllTransfers = async (apiKey: string, tokens: Token[]) => {
  const alchemy = await getAlchemy(apiKey);
  const tokenAddresses = tokens.map((token) => token.address);
  const maxBlockNumber = Math.max(...tokens.map((token) => token.blockNumber));

  let allTransfers: any[] = [];
  let pageKey = undefined;
  const RATE_LIMIT_DELAY = 200;
  const MAX_RETRIES = 3;

  while (true) {
    let retries = 0;
    let success = false;

    while (!success && retries < MAX_RETRIES) {
      try {
        const response = await alchemy.core.getAssetTransfers({
          contractAddresses: tokenAddresses,
          excludeZeroValue: true,
          category: [AssetTransfersCategory.ERC20],
          pageKey: pageKey,
        });

        allTransfers = [...allTransfers, ...response.transfers];

        if (response.transfers.length === 0) break;

        const lowestBlockInPage = Math.min(
          ...response.transfers.map((t) => Number(t.blockNum))
        );
        if (lowestBlockInPage <= maxBlockNumber && response.pageKey) {
          pageKey = response.pageKey;
          await delay(RATE_LIMIT_DELAY);
        } else {
          break;
        }

        success = true;
      } catch (error) {
        retries++;
        if (retries === MAX_RETRIES) {
          throw new Error(
            `Failed to fetch transfers after ${MAX_RETRIES} attempts: ${error}`
          );
        }
        await delay(RATE_LIMIT_DELAY * 2);
      }
    }

    if (!success) break;
  }

  const filteredTransfers = allTransfers.filter((transfer) => {
    const matchingToken = tokens.find(
      (token) =>
        token.address.toLowerCase() ===
        transfer.rawContract.address.toLowerCase()
    );
    return (
      matchingToken && Number(transfer.blockNum) <= matchingToken.blockNumber
    );
  });

  return { transfers: filteredTransfers };
};

export const snapshotHolders = async (apiKey: string, tokens: Token[]) => {
  const transfers = await getAllTransfers(apiKey, tokens);
  const holderBalances = new Map<string, Map<string, number>>();

  for (const token of tokens) {
    const tokenTransfers = transfers.transfers
      .filter(
        (transfer) =>
          transfer.rawContract.address.toLowerCase() ===
            token.address.toLowerCase() &&
          transfer.blockNum <= token.blockNumber
      )
      .sort((a, b) => Number(a.blockNum) - Number(b.blockNum));

    for (const transfer of tokenTransfers) {
      const amount = Number(transfer.value);
      const fromAddress = transfer.from;
      const toAddress = transfer.to;

      if (fromAddress !== "0x0000000000000000000000000000000000000000") {
        if (!holderBalances.has(fromAddress)) {
          holderBalances.set(fromAddress, new Map());
        }
        const senderBalances = holderBalances.get(fromAddress)!;
        const currentBalance = senderBalances.get(token.address) || 0;

        const newBalance = Math.max(0, currentBalance - amount);
        senderBalances.set(token.address, newBalance);
      }

      if (toAddress !== "0x0000000000000000000000000000000000000000") {
        if (!holderBalances.has(toAddress)) {
          holderBalances.set(toAddress, new Map());
        }
        const receiverBalances = holderBalances.get(toAddress)!;
        const currentBalance = receiverBalances.get(token.address) || 0;
        receiverBalances.set(token.address, currentBalance + amount);
      }
    }
  }

  const lpAddresses = new Set(
    tokens.map((token) => token.lpAddress.toLowerCase())
  );
  lpAddresses.forEach((lpAddress) => {
    holderBalances.delete(lpAddress);
  });

  const result: Balance[] = Array.from(holderBalances.entries())
    .map(([holderAddress, tokenBalances]) => ({
      holderAddress,
      balances: Array.from(tokenBalances.entries())
        .map(([tokenAddress, balance]) => ({
          tokenAddress,
          balance,
        }))
        .filter((balance) => balance.balance !== 0),
    }))
    .filter((holder) => holder.balances.length > 0);

  return result;
};

function getWeightedRandomIndex(weights: number[]): number {
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  let random = Math.random() * totalWeight;

  for (let i = 0; i < weights.length; i++) {
    random -= weights[i];
    if (random <= 0) {
      return i;
    }
  }
  return weights.length - 1;
}

export const getRandomWinners = async (
  apiKey: string,
  tokens: Token[],
  numberOfWinners: number
): Promise<Winner[]> => {
  const holders = await snapshotHolders(apiKey, tokens);

  const holdersWithWeights: Winner[] = holders.map((holder) => ({
    address: holder.holderAddress,
    weight: holder.balances.reduce((sum, balance) => sum + balance.balance, 0),
    balances: [holder],
  }));

  holdersWithWeights.sort((a, b) => b.weight - a.weight);

  if (numberOfWinners >= holdersWithWeights.length) {
    return holdersWithWeights;
  }

  const winners = new Set<string>();
  const selectedWinners: Winner[] = [];
  const weights = holdersWithWeights.map((h) => h.weight);

  while (
    winners.size < numberOfWinners &&
    winners.size < holdersWithWeights.length
  ) {
    const selectedIndex = getWeightedRandomIndex(weights);
    const winner = holdersWithWeights[selectedIndex];

    if (!winners.has(winner.address)) {
      winners.add(winner.address);
      selectedWinners.push(winner);
      weights[selectedIndex] = 0;
    }
  }

  return selectedWinners.sort((a, b) => b.weight - a.weight);
};

export const exportWinnersToCSV = async (
  winners: Winner[],
  tokens: Token[]
) => {
  const headers = [
    "Holder Address",
    "Total Weight",
    ...tokens.map((token) => token.address),
  ];

  const rows = winners.map((winner) => {
    const row: (string | number)[] = [winner.address, winner.weight];

    tokens.forEach((token) => {
      const balance =
        winner.balances[0]?.balances.find(
          (b) => b.tokenAddress.toLowerCase() === token.address.toLowerCase()
        )?.balance || 0;
      row.push(balance);
    });

    return row;
  });

  const csvContent = [
    headers.join(","),
    ...rows.map((row) => row.join(",")),
  ].join("\n");

  fs.writeFileSync("results.csv", csvContent);
};
