import { Contract, parseEther, formatEther, id, zeroPadValue, toBeArray } from "ethers";
import WalletManager from "./WalletManager";

const ESCROW_ADDRESS = "0xa145f82DC5b285B970BE71F48Cf5173E722cF515";

const ESCROW_ABI = [
  "function createMatch(bytes32 matchId) external payable",
  "function joinMatch(bytes32 matchId) external payable",
  "event MatchCreated(bytes32 matchId, address playerA, uint256 stake)",
  "event MatchReady(bytes32 matchId, address playerA, address playerB)",
];

class EscrowManagerClass {
  private getContract(): Contract {
    const signer = WalletManager.getSigner();
    if (!signer) throw new Error("Wallet not connected");
    return new Contract(ESCROW_ADDRESS, ESCROW_ABI, signer);
  }

  // Generate a matchId from room code
  matchIdFromCode(roomCode: string): string {
    const bytes = zeroPadValue(toBeArray(BigInt("0x" + Buffer.from(roomCode).toString("hex"))), 32);
    return bytes;
  }

  async createMatch(roomCode: string, stakeAvax: number): Promise<void> {
    const contract = this.getContract();
    const matchId = this.matchIdFromCode(roomCode);
    const value = parseEther(stakeAvax.toString());

    console.log(`[EscrowManager] Creating match: ${roomCode}, stake: ${stakeAvax} AVAX`);
    const tx = await contract.createMatch(matchId, { value });
    await tx.wait();
    console.log(`[EscrowManager] Match created, tx: ${tx.hash}`);
  }

  async joinMatch(roomCode: string, stakeAvax: number): Promise<void> {
    const contract = this.getContract();
    const matchId = this.matchIdFromCode(roomCode);
    const value = parseEther(stakeAvax.toString());

    console.log(`[EscrowManager] Joining match: ${roomCode}, stake: ${stakeAvax} AVAX`);
    const tx = await contract.joinMatch(matchId, { value });
    await tx.wait();
    console.log(`[EscrowManager] Match joined, tx: ${tx.hash}`);
  }
}

const EscrowManager = new EscrowManagerClass();
export default EscrowManager;