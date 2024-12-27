export type Token = {
  address: string;
  lpAddress: string;
};

export type Balance = {
  holderAddress: string;
  balances: {
    tokenAddress: string;
    balance: number;
    lpBalance: number;
  }[];
};

export type Winner = {
  address: string;
  weight: number;
  balances: Balance[];
};

export interface Slot0Data {
  sqrtPriceX96: bigint;
  tick: number;
}

export interface LPHolder {
  address: string;
  tokenIds: bigint[];
}
