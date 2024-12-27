import type { Token } from "./types";
import {
  getAllTransfers,
  snapshotHolders,
  getRandomWinners,
  exportWinnersToCSV,
  getAllLPHolders,
  exportSnapshotToCSV,
  exportLPsToJSON,
  exportLPBalancesToCSV,
  getAllLPBalances,
  exportTransfersToCSV,
} from "./api";

export const DaosWorldIndexer = class {
  alchemyApiKey: string;
  tokens: Token[];
  logging: boolean | undefined;

  constructor(obj: {
    alchemyApiKey: string;
    tokens: Token[];
    logging?: boolean;
  }) {
    this.alchemyApiKey = obj.alchemyApiKey;
    this.tokens = obj.tokens;
    this.logging = obj.logging;
  }

  getTransfers = async (blockNumber: number, csvExportFilename?: string) => {
    if (this.logging) console.time("getTransfers");

    const transfers = await getAllTransfers(
      this.alchemyApiKey,
      blockNumber,
      this.tokens,
      this.logging
    );

    if (csvExportFilename) {
      await exportTransfersToCSV(
        transfers,
        blockNumber,
        csvExportFilename,
        this.logging
      );
    }

    if (this.logging) console.timeEnd("getTransfers");

    return transfers;
  };

  getLPHolders = async (blockNumber: number, jsonExportFilename?: string) => {
    if (this.logging) console.time("getLPHolders");

    const lpHolders = await getAllLPHolders(
      this.alchemyApiKey,
      blockNumber,
      this.tokens,
      this.logging
    );

    if (jsonExportFilename) {
      await exportLPsToJSON(
        lpHolders,
        blockNumber,
        jsonExportFilename,
        this.logging
      );
    }

    if (this.logging) console.timeEnd("getLPHolders");

    return lpHolders;
  };

  getLPBalances = async (blockNumber: number, csvExportFilename?: string) => {
    if (this.logging) console.time("getLPBalances");

    const lpBalances = await getAllLPBalances(
      this.alchemyApiKey,
      blockNumber,
      this.tokens,
      this.logging
    );

    if (csvExportFilename) {
      await exportLPBalancesToCSV(
        lpBalances,
        this.tokens,
        blockNumber,
        csvExportFilename,
        this.logging
      );
    }

    if (this.logging) console.timeEnd("getLPBalances");

    return lpBalances;
  };

  getBalanceSnapshot = async (
    blockNumber: number,
    includeLPs: boolean,
    csvExportFilename?: string
  ) => {
    if (this.logging) console.time("getBalanceSnapshot");

    const snapshot = await snapshotHolders(
      this.alchemyApiKey,
      blockNumber,
      this.tokens,
      includeLPs,
      this.logging
    );

    if (csvExportFilename) {
      await exportSnapshotToCSV(
        snapshot,
        this.tokens,
        blockNumber,
        csvExportFilename,
        this.logging
      );
    }

    if (this.logging) console.timeEnd("getBalanceSnapshot");

    return snapshot;
  };

  getRandomWinners = async (
    blockNumber: number,
    lpWeight: number,
    numberOfWinners: number,
    csvExportFilename?: string
  ) => {
    if (this.logging) console.time("getRandomWinners");

    const winners = await getRandomWinners(
      this.alchemyApiKey,
      blockNumber,
      this.tokens,
      lpWeight,
      numberOfWinners,
      this.logging
    );

    if (csvExportFilename) {
      await exportWinnersToCSV(
        winners,
        this.tokens,
        blockNumber,
        csvExportFilename,
        this.logging
      );
    }

    if (this.logging) console.timeEnd("getRandomWinners");

    return winners;
  };
};
