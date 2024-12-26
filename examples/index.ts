import { DaosWorldIndexer } from "../src";

const indexer = new DaosWorldIndexer({
  alchemyApiKey: process.env.ALCHEMY_API_KEY!,
  tokens: [
    {
      address: "0x20ef84969f6d81Ff74AE4591c331858b20AD82CD",
      blockNumber: 24228147,
      lpAddress: "0x197ecb5c176aD4f6e77894913a94c5145416f148",
    },
    {
      address: "0x3e43cB385A6925986e7ea0f0dcdAEc06673d4e10",
      blockNumber: 24228147,
      lpAddress: "0x3fdD9A4b3CA4a99e3dfE931e3973C2aC37B45BE9",
    },
    {
      address: "0x2b0772BEa2757624287ffc7feB92D03aeAE6F12D",
      blockNumber: 24228147,
      lpAddress: "0xF5677B22454dEe978b2Eb908d6a17923F5658a79",
    },
  ],
});

await indexer.exportRandomWinners(100);
