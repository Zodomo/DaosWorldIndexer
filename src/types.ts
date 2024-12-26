export type Token = {
  address: string;
  blockNumber: number;
  lpAddress: string;
};

export type Balance = {
  holderAddress?: string;
  balances: {
    tokenAddress: string;
    balance: number;
  }[];
};

export type Winner = {
  address: string;
  weight: number;
  balances: Balance[];
};
