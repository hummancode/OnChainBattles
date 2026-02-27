import { defineConfig } from "hardhat/config";
import hardhatEthers from "@nomicfoundation/hardhat-ethers";
import * as dotenv from "dotenv";
dotenv.config();

const FUJI_PRIVATE_KEY = process.env.FUJI_PRIVATE_KEY ?? "";

export default defineConfig({
  plugins: [hardhatEthers],
  solidity: "0.8.19",
  networks: {
    fuji: {
      type: "http",
      url: "https://api.avax-test.network/ext/bc/C/rpc",
      chainId: 43113,
      accounts: [FUJI_PRIVATE_KEY],
    },
  },
});