// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract PuzzleEscrow {
    // ─── Puzzle State ───────────────────────────────────────────
    enum PuzzleStatus { Active, Solved, Closed }

    struct Puzzle {
        uint256 prizePool;
        uint256 attemptFee;
        PuzzleStatus status;
        address solver;
    }

    mapping(bytes32 => Puzzle) public puzzles;
    address public owner;

    // ─── Events ─────────────────────────────────────────────────
    event PuzzleCreated(bytes32 puzzleId, uint256 prizePool, uint256 attemptFee);
    event AttemptPaid(bytes32 puzzleId, address player, uint256 newPrizePool);
    event PrizeClaimed(bytes32 puzzleId, address solver, uint256 payout);
    event PuzzleClosed(bytes32 puzzleId, uint256 refunded);

    constructor() {
        owner = msg.sender;
    }

    // ─── Create Puzzle ──────────────────────────────────────────
    // Admin seeds the prize pool and sets the per-attempt fee.
    function createPuzzle(bytes32 puzzleId, uint256 attemptFee) external payable {
        require(msg.sender == owner, "Only owner");
        require(puzzles[puzzleId].prizePool == 0 && puzzles[puzzleId].attemptFee == 0, "Puzzle exists");

        puzzles[puzzleId] = Puzzle({
            prizePool: msg.value,
            attemptFee: attemptFee,
            status: PuzzleStatus.Active,
            solver: address(0)
        });

        emit PuzzleCreated(puzzleId, msg.value, attemptFee);
    }

    // ─── Submit Attempt ─────────────────────────────────────────
    // Player pays the attempt fee; fee is added to the prize pool.
    function submitAttempt(bytes32 puzzleId) external payable {
        Puzzle storage p = puzzles[puzzleId];
        require(p.status == PuzzleStatus.Active, "Puzzle not active");
        require(msg.value == p.attemptFee, "Wrong attempt fee");

        p.prizePool += msg.value;

        emit AttemptPaid(puzzleId, msg.sender, p.prizePool);
    }

    // ─── Claim Prize ────────────────────────────────────────────
    // Backend calls after verifying the solution server-side.
    function claimPrize(bytes32 puzzleId, address solver) external {
        require(msg.sender == owner, "Only owner");
        Puzzle storage p = puzzles[puzzleId];
        require(p.status == PuzzleStatus.Active, "Puzzle not active");

        p.status = PuzzleStatus.Solved;
        p.solver = solver;

        uint256 payout = p.prizePool;
        p.prizePool = 0;

        payable(solver).transfer(payout);

        emit PrizeClaimed(puzzleId, solver, payout);
    }

    // ─── Close Puzzle ───────────────────────────────────────────
    // Admin closes an unsolved puzzle; remaining pool refunded to owner.
    function closePuzzle(bytes32 puzzleId) external {
        require(msg.sender == owner, "Only owner");
        Puzzle storage p = puzzles[puzzleId];
        require(p.status == PuzzleStatus.Active, "Puzzle not active");

        p.status = PuzzleStatus.Closed;

        uint256 refund = p.prizePool;
        p.prizePool = 0;

        payable(owner).transfer(refund);

        emit PuzzleClosed(puzzleId, refund);
    }

    // ─── Emergency Withdraw ─────────────────────────────────────
    function withdraw() external {
        require(msg.sender == owner, "Only owner");
        payable(owner).transfer(address(this).balance);
    }

    // TODO: Future — add NFT prize support (ERC-721 transfer on solve)
}
