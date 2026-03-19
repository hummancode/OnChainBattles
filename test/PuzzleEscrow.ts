import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

describe("PuzzleEscrow", function () {
  async function deployFixture() {
    const [owner, player1, player2] = await ethers.getSigners();
    const contract = await ethers.deployContract("PuzzleEscrow");
    const puzzleId = ethers.solidityPackedKeccak256(["string", "uint256"], ["puzzle_", 1]);
    const attemptFee = ethers.parseEther("0.01");
    const seedPrize = ethers.parseEther("0.1");
    return { contract, owner, player1, player2, puzzleId, attemptFee, seedPrize };
  }

  // ─── createPuzzle ──────────────────────────────────────────
  describe("createPuzzle", function () {
    it("should create a puzzle with seed prize pool", async function () {
      const { contract, puzzleId, attemptFee, seedPrize } = await deployFixture();

      await expect(contract.createPuzzle(puzzleId, attemptFee, { value: seedPrize }))
        .to.emit(contract, "PuzzleCreated")
        .withArgs(puzzleId, seedPrize, attemptFee);

      const p = await contract.puzzles(puzzleId);
      expect(p.prizePool).to.equal(seedPrize);
      expect(p.attemptFee).to.equal(attemptFee);
      expect(p.status).to.equal(0n); // Active
      expect(p.solver).to.equal(ethers.ZeroAddress);
    });

    it("should revert if not owner", async function () {
      const { contract, player1, puzzleId, attemptFee, seedPrize } = await deployFixture();
      await expect(
        contract.connect(player1).createPuzzle(puzzleId, attemptFee, { value: seedPrize })
      ).to.be.revertedWith("Only owner");
    });

    it("should revert if puzzle already exists", async function () {
      const { contract, puzzleId, attemptFee, seedPrize } = await deployFixture();
      await contract.createPuzzle(puzzleId, attemptFee, { value: seedPrize });
      await expect(
        contract.createPuzzle(puzzleId, attemptFee, { value: seedPrize })
      ).to.be.revertedWith("Puzzle exists");
    });

    it("should allow zero seed prize (fee-only puzzle)", async function () {
      const { contract, puzzleId, attemptFee } = await deployFixture();
      await contract.createPuzzle(puzzleId, attemptFee, { value: 0 });
      const p = await contract.puzzles(puzzleId);
      expect(p.prizePool).to.equal(0n);
    });
  });

  // ─── submitAttempt ──────────────────────────────────────────
  describe("submitAttempt", function () {
    it("should accept attempt fee and grow prize pool", async function () {
      const { contract, player1, puzzleId, attemptFee, seedPrize } = await deployFixture();
      await contract.createPuzzle(puzzleId, attemptFee, { value: seedPrize });

      await expect(contract.connect(player1).submitAttempt(puzzleId, { value: attemptFee }))
        .to.emit(contract, "AttemptPaid")
        .withArgs(puzzleId, player1.address, seedPrize + attemptFee);

      const p = await contract.puzzles(puzzleId);
      expect(p.prizePool).to.equal(seedPrize + attemptFee);
    });

    it("should revert with wrong fee", async function () {
      const { contract, player1, puzzleId, attemptFee, seedPrize } = await deployFixture();
      await contract.createPuzzle(puzzleId, attemptFee, { value: seedPrize });

      await expect(
        contract.connect(player1).submitAttempt(puzzleId, { value: ethers.parseEther("0.005") })
      ).to.be.revertedWith("Wrong attempt fee");
    });

    it("should revert if puzzle is not active", async function () {
      const { contract, player1, puzzleId, attemptFee } = await deployFixture();
      // Puzzle doesn't exist — status defaults to 0 (Active) but attemptFee is 0
      // So we need to create and close it first
      await contract.createPuzzle(puzzleId, attemptFee, { value: ethers.parseEther("0.1") });
      await contract.closePuzzle(puzzleId);

      await expect(
        contract.connect(player1).submitAttempt(puzzleId, { value: attemptFee })
      ).to.be.revertedWith("Puzzle not active");
    });
  });

  // ─── claimPrize ─────────────────────────────────────────────
  describe("claimPrize", function () {
    it("should pay solver the full prize pool", async function () {
      const { contract, player1, player2, puzzleId, attemptFee, seedPrize } = await deployFixture();
      await contract.createPuzzle(puzzleId, attemptFee, { value: seedPrize });

      // Two attempts
      await contract.connect(player1).submitAttempt(puzzleId, { value: attemptFee });
      await contract.connect(player2).submitAttempt(puzzleId, { value: attemptFee });

      const expectedPayout = seedPrize + attemptFee * 2n;
      const balBefore = await ethers.provider.getBalance(player1.address);

      await expect(contract.claimPrize(puzzleId, player1.address))
        .to.emit(contract, "PrizeClaimed")
        .withArgs(puzzleId, player1.address, expectedPayout);

      const balAfter = await ethers.provider.getBalance(player1.address);
      expect(balAfter - balBefore).to.equal(expectedPayout);

      const p = await contract.puzzles(puzzleId);
      expect(p.status).to.equal(1n); // Solved
      expect(p.solver).to.equal(player1.address);
      expect(p.prizePool).to.equal(0n);
    });

    it("should revert if not owner", async function () {
      const { contract, player1, puzzleId, attemptFee, seedPrize } = await deployFixture();
      await contract.createPuzzle(puzzleId, attemptFee, { value: seedPrize });
      await expect(
        contract.connect(player1).claimPrize(puzzleId, player1.address)
      ).to.be.revertedWith("Only owner");
    });

    it("should revert on double claim", async function () {
      const { contract, player1, puzzleId, attemptFee, seedPrize } = await deployFixture();
      await contract.createPuzzle(puzzleId, attemptFee, { value: seedPrize });
      await contract.claimPrize(puzzleId, player1.address);
      await expect(
        contract.claimPrize(puzzleId, player1.address)
      ).to.be.revertedWith("Puzzle not active");
    });
  });

  // ─── closePuzzle ────────────────────────────────────────────
  describe("closePuzzle", function () {
    it("should refund remaining pool to owner", async function () {
      const { contract, owner, player1, puzzleId, attemptFee, seedPrize } = await deployFixture();
      await contract.createPuzzle(puzzleId, attemptFee, { value: seedPrize });
      await contract.connect(player1).submitAttempt(puzzleId, { value: attemptFee });

      const expectedRefund = seedPrize + attemptFee;
      const balBefore = await ethers.provider.getBalance(owner.address);

      const tx = await contract.closePuzzle(puzzleId);
      const receipt = await tx.wait();
      const gasCost = receipt!.gasUsed * receipt!.gasPrice;

      const balAfter = await ethers.provider.getBalance(owner.address);
      expect(balAfter - balBefore + gasCost).to.equal(expectedRefund);

      const p = await contract.puzzles(puzzleId);
      expect(p.status).to.equal(2n); // Closed
    });

    it("should revert if puzzle already solved", async function () {
      const { contract, player1, puzzleId, attemptFee, seedPrize } = await deployFixture();
      await contract.createPuzzle(puzzleId, attemptFee, { value: seedPrize });
      await contract.claimPrize(puzzleId, player1.address);
      await expect(contract.closePuzzle(puzzleId)).to.be.revertedWith("Puzzle not active");
    });

    it("should revert if not owner", async function () {
      const { contract, player1, puzzleId, attemptFee, seedPrize } = await deployFixture();
      await contract.createPuzzle(puzzleId, attemptFee, { value: seedPrize });
      await expect(
        contract.connect(player1).closePuzzle(puzzleId)
      ).to.be.revertedWith("Only owner");
    });
  });

  // ─── Full Flow ──────────────────────────────────────────────
  describe("full flow", function () {
    it("create → 3 attempts → solve → solver gets seed + 3 fees", async function () {
      const { contract, player1, player2, puzzleId, attemptFee, seedPrize } = await deployFixture();

      await contract.createPuzzle(puzzleId, attemptFee, { value: seedPrize });

      // 3 attempts from different players
      await contract.connect(player1).submitAttempt(puzzleId, { value: attemptFee });
      await contract.connect(player2).submitAttempt(puzzleId, { value: attemptFee });
      await contract.connect(player1).submitAttempt(puzzleId, { value: attemptFee });

      const expectedPayout = seedPrize + attemptFee * 3n;
      const balBefore = await ethers.provider.getBalance(player2.address);

      await contract.claimPrize(puzzleId, player2.address);

      const balAfter = await ethers.provider.getBalance(player2.address);
      expect(balAfter - balBefore).to.equal(expectedPayout);
    });
  });
});
