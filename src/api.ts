import {
  Alchemy,
  Network,
  AssetTransfersCategory,
  type AssetTransfersResponse,
} from "alchemy-sdk";
import type { Token, Balance, Winner, Slot0Data, LPHolder } from "./types";
import { createPublicClient, http, parseAbiItem, type Hex } from "viem";
import { Token as UniToken } from "@uniswap/sdk-core";
import { Pool, Position } from "@uniswap/v3-sdk";
import { base } from "viem/chains";
import * as fs from "fs";

const DELAY_SHORT = 75;
const DELAY_LONG = 250;
const DELAY_ERROR = 500;

const POOL_ABI = [
  {
    name: "slot0",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "sqrtPriceX96", type: "uint160" },
      { name: "tick", type: "int24" },
      { name: "observationIndex", type: "uint16" },
      { name: "observationCardinality", type: "uint16" },
      { name: "observationCardinalityNext", type: "uint16" },
      { name: "feeProtocol", type: "uint8" },
      { name: "unlocked", type: "bool" },
    ],
  },
] as const;

const MINT_EVENT = parseAbiItem(
  "event Mint(address sender, address indexed owner, int24 indexed tickLower, int24 indexed tickUpper, uint128 amount, uint256 amount0, uint256 amount1)"
);

const TRANSFER_EVENT = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)"
);

const POSITION_MANAGER = "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1";

const POSITION_MANAGER_ABI = [
  {
    name: "positions",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [
      { name: "nonce", type: "uint96" },
      { name: "operator", type: "address" },
      { name: "token0", type: "address" },
      { name: "token1", type: "address" },
      { name: "fee", type: "uint24" },
      { name: "tickLower", type: "int24" },
      { name: "tickUpper", type: "int24" },
      { name: "liquidity", type: "uint128" },
      { name: "feeGrowthInside0LastX128", type: "uint256" },
      { name: "feeGrowthInside1LastX128", type: "uint256" },
      { name: "tokensOwed0", type: "uint128" },
      { name: "tokensOwed1", type: "uint128" },
    ],
  },
] as const;

const REVERT_AUTOCOMPOUNDER =
  "0x83681C14770b44361e21Faf91D8325423365eA5C".toLowerCase();

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const getAlchemy = async (apiKey: string) => {
  const config = {
    apiKey: apiKey,
    network: Network.BASE_MAINNET,
  };
  const alchemy = new Alchemy(config);
  return alchemy;
};

export const getAllTransfers = async (
  apiKey: string,
  blockNumber: number,
  tokens: Token[],
  logging?: boolean
) => {
  if (logging) console.time("getAllTransfers");
  const alchemy = await getAlchemy(apiKey);
  const tokenAddresses = tokens.map((token) => token.address);

  let allTransfers: any[] = [];
  let pageKey = undefined;
  const MAX_RETRIES = 3;

  while (true) {
    let retries = 0;
    let success = false;

    while (!success && retries < MAX_RETRIES) {
      try {
        const transfers: AssetTransfersResponse =
          await alchemy.core.getAssetTransfers({
            contractAddresses: tokenAddresses,
            excludeZeroValue: true,
            category: [AssetTransfersCategory.ERC20],
            pageKey: pageKey,
          });

        if (transfers.transfers.length === 0) break;

        allTransfers = [...allTransfers, ...transfers.transfers];

        const lowestBlockInPage = Math.min(
          ...transfers.transfers.map((t) => Number(t.blockNum))
        );

        if (lowestBlockInPage <= blockNumber && transfers.pageKey) {
          pageKey = transfers.pageKey;
          await delay(DELAY_LONG);
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
        await delay(DELAY_ERROR);
      }
    }

    if (!success) break;
  }

  const filteredTransfers = allTransfers.filter(
    (transfer) => Number(transfer.blockNum) <= blockNumber
  );

  if (logging) console.timeEnd("getAllTransfers");
  return { transfers: filteredTransfers };
};

export const getAllLPHolders = async (
  apiKey: string,
  blockNumber: number,
  tokens: Token[],
  logging?: boolean
): Promise<LPHolder[]> => {
  if (logging) console.time("getAllLPHolders");
  const client = createPublicClient({
    chain: base,
    transport: http(`https://base-mainnet.g.alchemy.com/v2/${apiKey}`, {
      fetchOptions: {
        headers: {
          "Accept-Encoding": "gzip",
          "Content-Type": "application/json",
        },
      },
    }),
  });

  const tokenIdSet = new Set<bigint>();
  let firstMintBlock = BigInt(blockNumber);

  for (const token of tokens) {
    let success = false;
    let retries = 0;

    while (!success && retries < 3) {
      try {
        const mintLogs = await client.getLogs({
          address: token.lpAddress as Hex,
          events: [MINT_EVENT],
          fromBlock: 0n,
          toBlock: BigInt(blockNumber),
        });

        await delay(DELAY_LONG);

        for (const mintLog of mintLogs) {
          if (!mintLog.transactionHash) continue;

          firstMintBlock =
            mintLog.blockNumber && mintLog.blockNumber < firstMintBlock
              ? mintLog.blockNumber
              : firstMintBlock;

          try {
            const receipt = await client.getTransactionReceipt({
              hash: mintLog.transactionHash,
            });

            const transferLog = receipt.logs.find(
              (log) =>
                log.address.toLowerCase() === POSITION_MANAGER.toLowerCase() &&
                log.topics[0] ===
                  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef" &&
                log.topics[1] ===
                  "0x0000000000000000000000000000000000000000000000000000000000000000"
            );

            if (!transferLog?.topics[3]) continue;

            const tokenId = BigInt(transferLog.topics[3]);
            tokenIdSet.add(tokenId);
          } catch (error) {
            console.error(
              `Error processing transaction ${mintLog.transactionHash}:`,
              error
            );
          }

          await delay(DELAY_SHORT);
        }

        success = true;
      } catch (error) {
        retries++;
        await delay(DELAY_ERROR);

        if (retries === 3) {
          console.error(
            `Failed to fetch events for LP ${token.lpAddress}:`,
            error
          );
          break;
        }
      }
    }

    await delay(DELAY_LONG);
  }

  const holders = new Map<string, Set<bigint>>();
  const BLOCK_INCREMENT = 2000n;

  try {
    let currentBlock = firstMintBlock;
    const targetBlock = BigInt(blockNumber);

    while (currentBlock <= targetBlock) {
      const endBlock =
        currentBlock + BLOCK_INCREMENT > targetBlock
          ? targetBlock
          : currentBlock + BLOCK_INCREMENT;

      const transferLogs = await client.getLogs({
        address: POSITION_MANAGER as Hex,
        events: [TRANSFER_EVENT],
        fromBlock: currentBlock,
        toBlock: endBlock,
      });

      for (const log of transferLogs) {
        if (!log.topics[3]) continue;

        const tokenId = BigInt(log.topics[3]);

        if (!tokenIdSet.has(tokenId)) continue;

        const from = `0x${log.topics[1].slice(26)}`.toLowerCase();
        const to = `0x${log.topics[2].slice(26)}`.toLowerCase();

        if (holders.has(from)) {
          holders.get(from)!.delete(tokenId);
          if (holders.get(from)!.size === 0) {
            holders.delete(from);
          }
        }

        if (to !== "0x0000000000000000000000000000000000000000") {
          if (!holders.has(to)) {
            holders.set(to, new Set());
          }
          holders.get(to)!.add(tokenId);
        }
      }

      currentBlock = endBlock + 1n;
      await delay(DELAY_LONG);
    }
  } catch (error) {
    console.error("Error fetching transfer logs:", error);
  }

  holders.delete(REVERT_AUTOCOMPOUNDER);

  const result: LPHolder[] = Array.from(holders.entries())
    .map(([address, tokenIds]) => ({
      address,
      tokenIds: Array.from(tokenIds),
    }))
    .filter((holder) => holder.tokenIds.length > 0);

  if (logging) console.timeEnd("getAllLPHolders");
  return result;
};

export const getAllLPBalances = async (
  apiKey: string,
  blockNumber: number,
  tokens: Token[],
  logging?: boolean
): Promise<Balance[]> => {
  const client = createPublicClient({
    chain: base,
    transport: http(`https://base-mainnet.g.alchemy.com/v2/${apiKey}`, {
      fetchOptions: {
        headers: {
          "Accept-Encoding": "gzip",
          "Content-Type": "application/json",
        },
      },
    }),
  });

  const lpHolders = await getAllLPHolders(apiKey, blockNumber, tokens, logging);

  if (logging) console.time("getAllLPBalances");

  const slot0Calls = tokens.map((token) => ({
    address: token.lpAddress as Hex,
    abi: POOL_ABI,
    functionName: "slot0",
  }));

  const slot0Results = await client.multicall({
    contracts: slot0Calls,
    blockNumber: BigInt(blockNumber),
  });

  const slot0Cache = new Map<string, Slot0Data>();
  tokens.forEach((token, index) => {
    const result = slot0Results[index];
    if (result.status === "success") {
      slot0Cache.set(token.lpAddress, {
        sqrtPriceX96: result.result[0],
        tick: result.result[1],
      });
    }
  });

  const positionCalls = lpHolders.flatMap((holder) =>
    holder.tokenIds.map((tokenId) => ({
      address: POSITION_MANAGER as Hex,
      abi: POSITION_MANAGER_ABI,
      functionName: "positions",
      args: [tokenId],
      tokenId,
      holderAddress: holder.address,
    }))
  );

  const CHUNK_SIZE = 100;
  const positionResults = [];
  for (let i = 0; i < positionCalls.length; i += CHUNK_SIZE) {
    const chunk = positionCalls.slice(i, i + CHUNK_SIZE);
    const results = await client.multicall({
      contracts: chunk,
      blockNumber: BigInt(blockNumber),
    });
    positionResults.push(
      ...results.map((result, index) => ({
        ...result,
        tokenId: chunk[index].tokenId,
        holderAddress: chunk[index].holderAddress,
      }))
    );
  }

  const balances = new Map<
    string,
    Map<string, { balance: number; lpBalance: number }>
  >();

  for (let i = 0; i < positionResults.length; i++) {
    const result = positionResults[i];
    if (result.status !== "success") continue;

    const position = {
      nonce: result.result[0],
      operator: result.result[1],
      token0: result.result[2],
      token1: result.result[3],
      fee: result.result[4],
      tickLower: result.result[5],
      tickUpper: result.result[6],
      liquidity: result.result[7],
      feeGrowthInside0LastX128: result.result[8],
      feeGrowthInside1LastX128: result.result[9],
      tokensOwed0: result.result[10],
      tokensOwed1: result.result[11],
    };

    if (position.liquidity === 0n) continue;

    const matchingToken = tokens.find(
      (t) =>
        t.address.toLowerCase() === position.token0.toLowerCase() ||
        t.address.toLowerCase() === position.token1.toLowerCase()
    );
    if (!matchingToken) continue;

    const slot0 = slot0Cache.get(matchingToken.lpAddress);
    if (!slot0) continue;

    const token0 = new UniToken(base.id, position.token0, 18);
    const token1 = new UniToken(base.id, position.token1, 18);

    const pool = new Pool(
      token0,
      token1,
      position.fee,
      slot0.sqrtPriceX96.toString(),
      position.liquidity.toString(),
      slot0.tick
    );

    const uniPosition = new Position({
      pool,
      liquidity: position.liquidity.toString(),
      tickLower: position.tickLower,
      tickUpper: position.tickUpper,
    });

    const holderAddress = result.holderAddress;
    if (!balances.has(holderAddress)) {
      balances.set(holderAddress, new Map());
    }
    const holderBalances = balances.get(holderAddress)!;

    if (matchingToken.address.toLowerCase() === position.token0.toLowerCase()) {
      const amount = normalizeToEther(uniPosition.amount0.quotient.toString());
      const existing =
        holderBalances.get(matchingToken.address)?.lpBalance || 0;
      holderBalances.set(matchingToken.address, {
        balance: 0,
        lpBalance: existing + amount,
      });
    } else {
      const amount = normalizeToEther(uniPosition.amount1.quotient.toString());
      const existing =
        holderBalances.get(matchingToken.address)?.lpBalance || 0;
      holderBalances.set(matchingToken.address, {
        balance: 0,
        lpBalance: existing + amount,
      });
    }
  }

  const result: Balance[] = Array.from(balances.entries())
    .map(([holderAddress, tokenBalances]) => ({
      holderAddress,
      balances: Array.from(tokenBalances.entries())
        .map(([tokenAddress, amounts]) => ({
          tokenAddress,
          balance: amounts.balance,
          lpBalance: amounts.lpBalance,
        }))
        .filter((balance) => balance.lpBalance > 0),
    }))
    .filter((holder) => holder.balances.length > 0);

  if (logging) console.timeEnd("getAllLPBalances");
  return result;
};

export const snapshotHolders = async (
  apiKey: string,
  blockNumber: number,
  tokens: Token[],
  includeLPs: boolean,
  logging?: boolean
) => {
  const transfers = await getAllTransfers(apiKey, blockNumber, tokens, logging);
  const holderBalances = new Map<
    string,
    Map<string, { balance: number; lpBalance: number }>
  >();

  if (logging) console.time("snapshotHoldersTokens");

  for (const token of tokens) {
    const tokenTransfers = transfers.transfers
      .filter(
        (transfer) =>
          transfer.rawContract.address.toLowerCase() ===
          token.address.toLowerCase()
      )
      .sort((a, b) => Number(a.blockNum) - Number(b.blockNum));

    for (const transfer of tokenTransfers) {
      const amount = normalizeToEther(transfer.value);
      const fromAddress = transfer.from;
      const toAddress = transfer.to;

      if (fromAddress !== "0x0000000000000000000000000000000000000000") {
        if (!holderBalances.has(fromAddress)) {
          holderBalances.set(fromAddress, new Map());
        }
        const senderBalances = holderBalances.get(fromAddress)!;
        const currentBalance = senderBalances.get(token.address)?.balance || 0;

        senderBalances.set(token.address, {
          balance: Math.max(0, currentBalance - amount),
          lpBalance: senderBalances.get(token.address)?.lpBalance || 0,
        });
      }

      if (toAddress !== "0x0000000000000000000000000000000000000000") {
        if (!holderBalances.has(toAddress)) {
          holderBalances.set(toAddress, new Map());
        }
        const receiverBalances = holderBalances.get(toAddress)!;
        const currentBalance =
          receiverBalances.get(token.address)?.balance || 0;

        receiverBalances.set(token.address, {
          balance: currentBalance + amount,
          lpBalance: receiverBalances.get(token.address)?.lpBalance || 0,
        });
      }
    }
  }

  if (logging) console.timeEnd("snapshotHoldersTokens");

  if (includeLPs) {
    const lpBalances = await getAllLPBalances(
      apiKey,
      blockNumber,
      tokens,
      logging
    );

    if (logging) console.time("snapshotHoldersLPs");

    for (const lpHolder of lpBalances) {
      if (!holderBalances.has(lpHolder.holderAddress!)) {
        holderBalances.set(lpHolder.holderAddress!, new Map());
      }

      const holderBalance = holderBalances.get(lpHolder.holderAddress!)!;

      for (const balance of lpHolder.balances) {
        const existing = holderBalance.get(balance.tokenAddress) || {
          balance: 0,
          lpBalance: 0,
        };
        holderBalance.set(balance.tokenAddress, {
          balance: existing.balance,
          lpBalance: balance.lpBalance,
        });
      }
    }

    if (logging) console.timeEnd("snapshotHoldersLPs");
  }

  if (logging) console.time("snapshotHoldersSort");

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
        .map(([tokenAddress, amounts]) => ({
          tokenAddress,
          balance: amounts.balance,
          lpBalance: amounts.lpBalance,
        }))
        .filter((balance) => balance.balance > 0 || balance.lpBalance > 0),
    }))
    .filter((holder) => holder.balances.length > 0);

  if (logging) console.timeEnd("snapshotHoldersSort");
  return result;
};

function getWeightedRandomIndex(weights: number[]): number {
  if (weights.length === 0) {
    throw new Error("Weights array cannot be empty");
  }

  const totalWeight = weights.reduce(
    (sum, weight) => sum + Math.max(0, weight),
    0
  );
  if (totalWeight <= 0) {
    throw new Error("Total weight must be positive");
  }

  const randomBuffer = new Uint32Array(1);
  crypto.getRandomValues(randomBuffer);
  let random = (randomBuffer[0] / 0xffffffff) * totalWeight;

  for (let i = 0; i < weights.length; i++) {
    if (weights[i] < 0) continue;
    random -= weights[i];
    if (random <= 0) {
      return i;
    }
  }

  throw new Error("Failed to select weighted random index");
}

// If lpWeight is 0, LPs will not be considered in the results.
// Any other value will include them and be used as a multiplier for their weights.
export const getRandomWinners = async (
  apiKey: string,
  blockNumber: number,
  tokens: Token[],
  lpWeight: number,
  numberOfWinners: number,
  logging?: boolean
): Promise<Winner[]> => {
  const holders = await snapshotHolders(
    apiKey,
    blockNumber,
    tokens,
    lpWeight > 0,
    logging
  );

  if (logging) console.time("getRandomWinners");

  const holdersWithWeights: Winner[] = holders.map((holder) => ({
    address: holder.holderAddress,
    weight: holder.balances.reduce(
      (sum, balance) =>
        sum +
        normalizeToEther(balance.balance) +
        lpWeight * normalizeToEther(balance.lpBalance),
      0
    ),
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

  if (logging) console.timeEnd("getRandomWinners");
  return selectedWinners.sort((a, b) => b.weight - a.weight);
};

export const exportTransfersToCSV = async (
  transfers: { transfers: any[] },
  blockNumber?: number,
  csvExportFilename?: string,
  logging?: boolean
) => {
  if (logging) console.time("exportTransfersToCSV");

  const headers = [
    "Block Number",
    "Token Address",
    "From",
    "To",
    "Value",
    "Transaction Hash",
  ];

  const rows = transfers.transfers.map((transfer) => [
    transfer.blockNum,
    transfer.rawContract.address,
    transfer.from,
    transfer.to,
    normalizeToEther(transfer.value),
    transfer.hash,
  ]);

  const csvContent = [
    headers.join(","),
    ...rows.map((row) =>
      row
        .map((value) =>
          typeof value === "number"
            ? value.toFixed(18).replace(/\.?0+$/, "")
            : value
        )
        .join(",")
    ),
  ].join("\n");

  const filename = csvExportFilename
    ? csvExportFilename
    : `transfers-block-${blockNumber}.csv`;

  fs.writeFileSync(filename, csvContent);
  if (logging) console.timeEnd("exportTransfersToCSV");
};

export const exportLPsToJSON = async (
  holders: LPHolder[],
  blockNumber?: number,
  jsonExportFilename?: string,
  logging?: boolean
) => {
  if (logging) console.time("exportLPsToJSON");

  const formattedHolders = holders.map((holder) => ({
    address: holder.address,
    tokenIds: holder.tokenIds.map((id) => id.toString()),
  }));

  const filename = jsonExportFilename
    ? jsonExportFilename
    : `lp-holders-block-${blockNumber}.json`;

  fs.writeFileSync(filename, JSON.stringify(formattedHolders, null, 2));
  if (logging) console.timeEnd("exportLPsToJSON");
};

export const exportLPBalancesToCSV = async (
  lpBalances: Balance[],
  tokens: Token[],
  blockNumber?: number,
  csvExportFilename?: string,
  logging?: boolean
) => {
  if (logging) console.time("exportLPBalancesToCSV");

  const headers = [
    "Holder Address",
    ...tokens.map((token) => `${token.address} LP Balance`),
  ];

  const rows = lpBalances.map((holder) => {
    const row: (string | number)[] = [holder.holderAddress];

    tokens.forEach((token) => {
      const balance = holder.balances.find(
        (b) => b.tokenAddress.toLowerCase() === token.address.toLowerCase()
      );
      row.push(balance?.lpBalance || 0);
    });

    return row;
  });

  const csvContent = [
    headers.join(","),
    ...rows.map((row) =>
      row
        .map((value) =>
          typeof value === "number"
            ? value.toFixed(18).replace(/\.?0+$/, "")
            : value
        )
        .join(",")
    ),
  ].join("\n");

  const filename = csvExportFilename
    ? csvExportFilename
    : `lp-balances-block-${blockNumber}.csv`;

  fs.writeFileSync(filename, csvContent);
  if (logging) console.timeEnd("exportLPBalancesToCSV");
};

export const exportSnapshotToCSV = async (
  holders: Balance[],
  tokens: Token[],
  blockNumber?: number,
  csvExportFilename?: string,
  logging?: boolean
) => {
  if (logging) console.time("exportSnapshotToCSV");

  const headers = [
    "Holder Address",
    ...tokens.flatMap((token) => [
      `${token.address} Token Balance`,
      `${token.address} LP Balance`,
    ]),
  ];

  const rows = holders.map((holder) => {
    const row: (string | number)[] = [holder.holderAddress];

    tokens.forEach((token) => {
      const balances = holder.balances.find(
        (b) => b.tokenAddress.toLowerCase() === token.address.toLowerCase()
      );
      row.push(balances?.balance || 0);
      row.push(balances?.lpBalance || 0);
    });

    return row;
  });

  const csvContent = [
    headers.join(","),
    ...rows.map((row) =>
      row
        .map((value) =>
          typeof value === "number"
            ? value.toFixed(18).replace(/\.?0+$/, "")
            : value
        )
        .join(",")
    ),
  ].join("\n");

  const filename = csvExportFilename
    ? csvExportFilename
    : `snapshot-block-${blockNumber}.csv`;

  fs.writeFileSync(filename, csvContent);
  if (logging) console.timeEnd("exportSnapshotToCSV");
};

export const exportWinnersToCSV = async (
  winners: Winner[],
  tokens: Token[],
  blockNumber?: number,
  csvExportFilename?: string,
  logging?: boolean
) => {
  if (logging) console.time("exportWinnersToCSV");
  const headers = [
    "Holder Address",
    "Total Weight",
    ...tokens.flatMap((token) => [
      `${token.address} Token Balance`,
      `${token.address} LP Balance`,
    ]),
  ];

  const rows = winners.map((winner) => {
    const row: (string | number)[] = [winner.address, winner.weight];

    tokens.forEach((token) => {
      const balances = winner.balances[0]?.balances.find(
        (b) => b.tokenAddress.toLowerCase() === token.address.toLowerCase()
      );
      row.push(balances?.balance || 0);
      row.push(balances?.lpBalance || 0);
    });

    return row;
  });

  const csvContent = [
    headers.join(","),
    ...rows.map((row) =>
      row
        .map((value) =>
          typeof value === "number"
            ? value.toFixed(18).replace(/\.?0+$/, "")
            : value
        )
        .join(",")
    ),
  ].join("\n");

  const filename = csvExportFilename
    ? csvExportFilename
    : `winners-block-${blockNumber}.csv`;

  fs.writeFileSync(filename, csvContent);
  if (logging) console.timeEnd("exportWinnersToCSV");
};

function normalizeToEther(value: string | number): number {
  const num = Number(value);

  if (Math.abs(num) > 1e18) {
    return num / 1e18;
  }

  return num;
}
