// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract Escrow {
    // ─── Match State ──────────────────────────────────────────
    enum MatchStatus { Waiting, Ready, Finished }

    struct Match {
        address playerA;
        address playerB;
        uint256 stake;
        MatchStatus status;
    }

    mapping(bytes32 => Match) public matches;
    address public owner;
    uint256 public rakeBps = 500; // 5% rake (500 basis points)

    // ─── Events ───────────────────────────────────────────────
    event MatchCreated(bytes32 matchId, address playerA, uint256 stake);
    event MatchReady(bytes32 matchId, address playerA, address playerB);
    event MatchFinished(bytes32 matchId, address winner, uint256 payout);

    constructor() {
        owner = msg.sender;
    }

    // ─── Create Match ─────────────────────────────────────────
    function createMatch(bytes32 matchId) external payable {
        require(msg.value > 0, "Stake required");
        require(matches[matchId].playerA == address(0), "Match exists");

        matches[matchId] = Match({
            playerA: msg.sender,
            playerB: address(0),
            stake: msg.value,
            status: MatchStatus.Waiting
        });

        emit MatchCreated(matchId, msg.sender, msg.value);
    }

    // ─── Join Match ───────────────────────────────────────────
    function joinMatch(bytes32 matchId) external payable {
        Match storage m = matches[matchId];
        require(m.playerA != address(0), "Match not found");
        require(m.playerB == address(0), "Match full");
        require(msg.value == m.stake, "Wrong stake amount");
        require(msg.sender != m.playerA, "Cannot join own match");

        m.playerB = msg.sender;
        m.status = MatchStatus.Ready;

        emit MatchReady(matchId, m.playerA, m.playerB);
    }

    // ─── Claim Winnings ───────────────────────────────────────
    // Called by owner (your backend) after dice result is known
    function claimWinnings(bytes32 matchId, address winner) external {
        require(msg.sender == owner, "Only owner");
        Match storage m = matches[matchId];
        require(m.status == MatchStatus.Ready, "Match not ready");
        require(winner == m.playerA || winner == m.playerB, "Invalid winner");

        m.status = MatchStatus.Finished;

        uint256 pot = m.stake * 2;
        uint256 rake = (pot * rakeBps) / 10000;
        uint256 payout = pot - rake;

        payable(winner).transfer(payout);
        payable(owner).transfer(rake);

        emit MatchFinished(matchId, winner, payout);
    }

    // ─── Refund Tie ───────────────────────────────────────────
    function refundTie(bytes32 matchId) external {
        require(msg.sender == owner, "Only owner");
        Match storage m = matches[matchId];
        require(m.status == MatchStatus.Ready, "Match not ready");

        m.status = MatchStatus.Finished;
        payable(m.playerA).transfer(m.stake);
        payable(m.playerB).transfer(m.stake);
    }

    // ─── Owner Withdraw ───────────────────────────────────────
    function withdraw() external {
        require(msg.sender == owner, "Only owner");
        payable(owner).transfer(address(this).balance);
    }
}