import { BrowserProvider, JsonRpcSigner } from "ethers";

class WalletManagerClass {
  private provider: BrowserProvider | null = null;
  private signer: JsonRpcSigner | null = null;

  async connect(): Promise<string> {
    if (!window.ethereum) {
      throw new Error("No wallet found. Please install MetaMask or Core Wallet.");
    }

    this.provider = new BrowserProvider(window.ethereum);
    await this.provider.send("eth_requestAccounts", []);
    this.signer = await this.provider.getSigner();

    // Switch to Fuji testnet
    await this.switchToFuji();

    const address = await this.signer.getAddress();
    console.log(`[WalletManager] Connected: ${address}`);
    return address;
  }

  async switchToFuji(): Promise<void> {
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0xA869" }], // 43113 in hex
      });
    } catch (error: any) {
      // Chain not added yet — add it
      if (error.code === 4902) {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [{
            chainId: "0xA869",
            chainName: "Avalanche Fuji Testnet",
            nativeCurrency: { name: "AVAX", symbol: "AVAX", decimals: 18 },
            rpcUrls: ["https://api.avax-test.network/ext/bc/C/rpc"],
            blockExplorerUrls: ["https://testnet.snowtrace.io"],
          }],
        });
      }
    }
  }

  getSigner(): JsonRpcSigner | null {
    return this.signer;
  }

  getProvider(): BrowserProvider | null {
    return this.provider;
  }

  isConnected(): boolean {
    return this.signer !== null;
  }
}

const WalletManager = new WalletManagerClass();
export default WalletManager;