import type { Token } from "./types";
import {
  getAllTransfers,
  snapshotHolders,
  getRandomWinners,
  exportWinnersToCSV,
} from "./api";

export const DaosWorldIndexer = class {
  alchemyApiKey: string;
  tokens: Token[];

  constructor(obj: { alchemyApiKey: string; tokens: Token[] }) {
    this.alchemyApiKey = obj.alchemyApiKey;
    this.tokens = obj.tokens;
  }

  getTransfers = async () => {
    const request = await getAllTransfers(this.alchemyApiKey, this.tokens);
    return request;
  };

  getBalances = async () => {
    const request = await snapshotHolders(this.alchemyApiKey, this.tokens);
    return request;
  };

  getRandomWinners = async (numberOfWinners: number) => {
    const winners = await getRandomWinners(
      this.alchemyApiKey,
      this.tokens,
      numberOfWinners
    );
    return winners;
  };

  exportRandomWinners = async (numberOfWinners: number) => {
    const winners = await this.getRandomWinners(numberOfWinners);
    await exportWinnersToCSV(winners, this.tokens);
  };
};
