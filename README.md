# ⚔️ OnChainBattles

**A chess-like tactical card game on the Avalanche blockchain. Stake AVAX. Deploy units. Destroy the King.**

🎮 [Play Now](https://ocb-game.onrender.com/) · 📄 [Smart Contract on Fuji](https://testnet.snowtrace.io/address/0xa145f82DC5b285B970BE71F48Cf5173E722cF515) · 🏔️ Built for [Avalanche Build Games 2026](https://build.avax.network/build-games)

---

## What Is This?

OnChainBattles is a real-time PvP card battler where two players deploy historical units onto a 6×6 board, maneuver for position, and fight to destroy the opponent's King — with real AVAX on the line.

Think **chess meets Hearthstone, on-chain.** Card draw adds controlled randomness, but positioning, timing, and resource management are pure tactics. Losing feels like a mistake, not bad luck.

**This is not a concept.** It's a deployed, playable game with live smart contracts on Avalanche Fuji testnet.

---

## How It Works

**Each turn follows 5 phases:**

1. **DRAW** — Draw a card from your deck
2. **LEG** — Your King generates Legitimacy (the game's mana resource)
3. **PLAY** — Spend LEG to deploy a unit or cast a spell
4. **ACT** — Each unit on the board can move OR attack
5. **END** — Effects tick, turn passes to opponent

**Win condition:** Destroy the opponent's King.

**On-chain stakes:** Players can wager AVAX through a Solidity escrow contract. Winner takes 95% of the pot. 5% platform rake. Free-play mode also available.

---

## The Card System

23 unique cards across 4 types, forming a 31-card deck (+ pre-placed King):

| Type | Examples | Role |
|------|----------|------|
| **Standard Units** | Foot Soldier, Pikeman, Archer, Assassin, Scout, Lancer | Cheap early-game fighters with unique movement/attack patterns |
| **Royal Units** | Princess, Knight, Commander, King's Guard, Inquisitor | Powerful late-game units that require the discount engine |
| **Structures** | Castle, Temple, Village | Static buildings that provide auras, discounts, and board control |
| **Spells** | Disease, Casus Belli, Earthquake, Civil War | One-shot effects that disrupt the opponent's position or economy |

**The Royal Discount Engine** is the core strategic layer: Castle (−1 LEG), Temple (−1 LEG), and Princess (−1 LEG) reduce Royal unit costs. Protecting these structures unlocks your late-game power. Losing them locks you out.

---

## Key Mechanics

- **Legitimacy (LEG):** Mana that grows each turn. King generates +1/turn base. Princess adds +1 bonus. Spend it to deploy cards.
- **Positional Combat:** Units have distinct movement patterns (omni, diagonal, jump) and attack patterns (melee H/V, ranged diagonal, on-jump). No RNG in combat — ATK deals flat damage to DEF (HP).
- **Pikeman Flank Aura:** Any friendly unit on both left and right of a Pikeman grants +1 ATK +1 DEF. Rewards tight formations.
- **Cavalry Counter:** Pikemen deal ×3 damage to Cavalry units (Lancer, Scout, Commander, Knight).
- **Castle Spawning:** Castles auto-spawn a Foot Soldier every 3 turns and grant adjacent units +1 DEF.
- **Counter-Attacks:** Melee units strike back when attacked in melee range. Ranged units don't.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Game Engine** | Phaser 3 (TypeScript) |
| **Architecture** | Pure TS game logic → Phaser renders via EventBus (zero coupling) |
| **Multiplayer** | Socket.IO — room creation, seed sync, action relay |
| **Blockchain** | Avalanche C-Chain (Fuji Testnet) |
| **Smart Contracts** | Solidity (Hardhat v3) — Escrow.sol for match staking |
| **Web3 Integration** | ethers.js v6 — MetaMask / Core Wallet |
| **Bundler** | Vite |
| **Deployment** | Render (game client + server) |

### Architecture Principles

- **Game logic is framework-agnostic.** `Board`, `GameEngine`, `AbilitySystem`, `MovementRules` are pure TypeScript classes. Phaser never touches game state directly — it subscribes to events and renders.
- **Cards are data-driven.** Adding a new card means adding one object to `CardDefinitions.ts`. No new classes, no switch statements. Abilities resolve through a generic `AbilityResolver`.
- **Clean separation:** `SelectionManager` handles all input state. `BoardRenderer` handles all visuals. `GameEngine` is the single source of truth.

---

## Project Structure

```
src/
├── game/
│   ├── engine/          # GameEngine, Board, TurnManager, AbilitySystem
│   ├── data/            # CardDefinitions.ts — single source of truth for all cards
│   ├── types/           # CardTypes, EventTypes, AbilityTypes — full type system
│   ├── input/           # SelectionManager — click/tap handling state machine
│   └── utils/           # MovementRules, CombatResolver, helpers
├── scenes/
│   ├── MainMenuScene    # Lobby, room creation, mode selection
│   ├── BattleScene      # Core gameplay — board, hand, HUD
│   └── ResultScene      # Post-match results, payout display
├── rendering/
│   ├── BoardRenderer    # 6×6 grid, unit sprites, highlights
│   ├── HandRenderer     # Card fan in hand, selection glow
│   ├── HUDRenderer      # LEG display, turn indicator, phase label
│   └── CardRenderer     # Card face rendering with stats overlay
├── network/
│   └── SocketManager    # Socket.IO — room sync, action relay, seed sharing
├── web3/
│   ├── WalletManager    # MetaMask/Core connect, Fuji network switching
│   └── EscrowManager    # Escrow.sol interactions — create, join, payout
└── assets/
    └── cards/
        ├── art/         # Full card illustrations (23 unique cards)
        └── thumb/       # Board thumbnails for deployed units
```

---

## Smart Contract

**Escrow.sol** on Avalanche Fuji Testnet:

- **Address:** `0xa145f82DC5b285B970BE71F48Cf5173E722cF515`
- **Explorer:** [View on Snowtrace](https://testnet.snowtrace.io/address/0xa145f82DC5b285B970BE71F48Cf5173E722cF515)
- **Rake:** 5% (500 basis points)

**Match flow:**
1. Player A creates room → deposits AVAX into escrow
2. Player B joins room → matches the deposit
3. Contract moves to `Ready` state
4. Game plays out in the client
5. Winner's address is submitted → contract auto-pays winner 95% of pot

---

## Getting Started

### Prerequisites
- Node.js 18+
- MetaMask or Core Wallet (for crypto mode)
- Test AVAX from [faucet.avax.network](https://faucet.avax.network) (for staked matches)

### Run Locally

```bash
# Clone
git clone https://github.com/hummancode/OnChainBattles.git
cd OnChainBattles

# Install dependencies
npm install

# Start dev server
npm run dev
```

The game runs at `http://localhost:5173`. Open two browser tabs to test PvP locally.

### Deploy Contracts (optional)

```bash
cd contracts
npm install
npx hardhat compile
npx hardhat run scripts/deploy.ts --network fuji
```

---

## Roadmap

| Phase | Status | Focus |
|-------|--------|-------|
| **Phase 1:** Core Game | ✅ Complete | Board, cards, turns, PvP multiplayer, escrow |
| **Phase 2:** Engine Expansion | 🔨 In Progress | Spell cards, server-authoritative sim, replay logs |
| **Phase 3:** Deck Building + Mainnet | 📋 Planned | Custom decks, 30+ cards, Avalanche mainnet deploy |
| **Phase 4:** Competitive | 📋 Planned | Glicko-2 ranked matchmaking, leaderboards, spectator mode |
| **Phase 5:** Economy | 📋 Planned | NFT card minting, marketplace, seasonal tournaments |

---

## Why Avalanche?

- **Low fees** make micro-stakes ($1–5 AVAX matches) economically viable
- **Fast finality** means escrow deposits confirm in seconds, not minutes
- **Subnet potential** for a dedicated game chain as player base grows
- **Fuji testnet** with free faucet AVAX for zero-cost development and playtesting

---

## Solo Build

Built entirely by one developer in Ankara, Turkey. Mechanical engineering background (automation & control systems) applied to game system design — the LEG economy, aura calculations, and state machines draw directly from control theory principles.

---

## License

All rights reserved. Source code is visible for competition evaluation purposes.

---

<p align="center">
  <strong>🏔️ Built on Avalanche · ⚔️ Stake. Deploy. Conquer.</strong>
</p>
