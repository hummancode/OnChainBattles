const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");

module.exports = buildModule("PuzzleEscrowModule", (m) => {
  const puzzleEscrow = m.contract("PuzzleEscrow");
  return { puzzleEscrow };
});
