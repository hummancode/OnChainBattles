import { Contract, parseEther } from "ethers";
import WalletManager from "./WalletManager";

export const STAKE_AVAX = 0.01; // Hardcoded stake for Phase 1

const ESCROW_ADDRESS = "0xa145f82DC5b285B970BE71F48Cf5173E722cF515";

const ESCROW_ABI = [
  "function createMatch(bytes32 matchId) external payable",
  "function joinMatch(bytes32 matchId) external payable",
  "function matches(bytes32) view returns (address playerA, address playerB, uint256 stake, uint8 status)",
  "event MatchCreated(bytes32 matchId, address playerA, uint256 stake)",
  "event MatchReady(bytes32 matchId, address playerA, address playerB)",
  "event MatchFinished(bytes32 matchId, address winner, uint256 payout)",
];

class EscrowManagerClass {
  private getContract(): Contract {
    const signer = WalletManager.getSigner();
    if (!signer) throw new Error("Wallet not connected");
    return new Contract(ESCROW_ADDRESS, ESCROW_ABI, signer);
  }

  // Generate matchId from room code — MUST match server logic
  // Server uses: Buffer.from(roomCode, 'utf8').toString('hex').padStart(64, '0')
  matchIdFromCode(roomCode: string): string {
    const hex = Array.from(new TextEncoder().encode(roomCode))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    const padded = hex.padStart(64, '0');
    return '0x' + padded;
  }

  async createMatch(roomCode: string): Promise<string> {
    const contract = this.getContract();
    const matchId = this.matchIdFromCode(roomCode);
    const value = parseEther(STAKE_AVAX.toString());

    console.log(`[EscrowManager] Creating match: ${roomCode} (matchId: ${matchId}), stake: ${STAKE_AVAX} AVAX`);
    const tx = await contract.createMatch(matchId, { value });
    const receipt = await tx.wait();
    console.log(`[EscrowManager] Match created, tx: ${tx.hash}`);
    return tx.hash;
  }

  async joinMatch(roomCode: string): Promise<string> {
    const contract = this.getContract();
    const matchId = this.matchIdFromCode(roomCode);
    const value = parseEther(STAKE_AVAX.toString());

    console.log(`[EscrowManager] Joining match: ${roomCode} (matchId: ${matchId}), stake: ${STAKE_AVAX} AVAX`);
    const tx = await contract.joinMatch(matchId, { value });
    await tx.wait();
    console.log(`[EscrowManager] Match joined, tx: ${tx.hash}`);
    return tx.hash;
  }
}

const EscrowManager = new EscrowManagerClass();
export default EscrowManager;