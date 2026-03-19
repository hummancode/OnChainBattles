# OCB Test & Remediation Plan — Revised
*Based on Complete Audit v4/v5, verified against actual codebase (15 March 2026)*

## Audit Corrections

The original audit has several inaccuracies that this revision corrects:

| Claim | Reality | Impact |
|-------|---------|--------|
| 171 tests / 17 files | **171 tests / 17 files** (confirmed accurate) | Baseline correct. After Phase 1 infra: 184 tests / 18 files. |
| B2: Assassin ON_JUMP is a gameplay bug | **Dead code but no gameplay bug** — assassin works via `customAttack` pattern | B2 fix is code cleanup, not a bug fix. Lower priority. |
| Line references (15232, 14746, etc.) | These reference `codebase.md` line numbers, not actual files | Use actual file + line numbers below |
| S3: No rate limiting | Rate limiting exists for Socket.IO (30/sec) + auth routes (10/15min) | Gap is only REST API routes without auth |
| "Engine module coverage 31%" | Meaningless without line-level coverage tool | Use structural gap analysis instead |

## Verified Bugs (Fix Before Tests)

### B1: Lancer charge empty if-block — LIVE BUG
- **File**: `src/game/phases/ActPhase.ts:56-59`
- **Issue**: Empty if-block — backward move should forfeit charge attack
- **Fix**: Set `unit.hasActed = true` inside the block (backward move = turn ends)

### B3: Earthquake COLUMN no-op — LATENT BUG
- **File**: `src/game/pending/PendingCommandResolver.ts` (no COLUMN handler)
- **Issue**: `resolvePending()` has no COLUMN case — earthquake does nothing
- **Fix**: Add COLUMN handler that applies damage to all units in selected column
- **Also**: `GameEngine.ts:selectColumn` — must pass `{ board }` as context

### B4: War Horn DISCARD no-op — LATENT BUG
- **File**: `src/game/pending/PendingCommandResolver.ts` (no DISCARD handler)
- **Issue**: `selectDiscard()` resolves pending but never removes card from hand
- **Fix**: Add DISCARD handler in resolver, or direct discard in `GameEngine.selectDiscard()`

### B2: Assassin ON_JUMP dead code — CODE CLEANUP (not a bug)
- **File**: `src/game/phases/ActPhase.ts:84-91`
- **Issue**: ON_JUMP auto-attack fires after `moveUnit()`, finding the assassin itself (not enemy). But assassin's jump-attack works correctly through `customAttack` pattern.
- **Fix**: Either remove the dead ON_JUMP block, or refactor to enable move-onto-enemy as a combined action. This is a design decision, not a bugfix.

## Verified Security Findings

### S1: JWT_SECRET hardcoded fallback — FIX
- **File**: `server/api/middleware.ts:9`
- **Code**: `process.env.JWT_SECRET ?? 'ocb-dev-secret-replace-in-production'`
- **Fix**: Throw on missing `JWT_SECRET` in production (`NODE_ENV === 'production'`)

### S2: Express CORS wide open — FIX
- **File**: `server/app.ts:26`
- **Code**: `app.use(cors({ origin: '*' }))`
- **Fix**: Use same `allowedOrigins` logic as Socket.IO (already defined at line 34-36)

### D1: Lobby deck not validated — FIX
- **File**: `server/lobby/LobbyManager.ts:184-192`
- **Issue**: `deck_submitted` accepts any `deckIds` array without validation
- **Fix**: Call `DeckValidator.validateDeck(deckIds)` before storing

### R1: No default deck on timeout — FIX
- **File**: `server/lobby/LobbyManager.ts:213-216`
- **Issue**: 10s timeout fires `finalizeLaunch()` with null deckIds
- **Fix**: In `finalizeLaunch()`, substitute `default-deck.json` IDs for null deckIds

---

## Test Infrastructure (Do First)

### I1: TestHarness enhancements (~30 min)

Add to `tests/engine/helpers/TestHarness.ts`:

```typescript
// Inject specific cards into a player's hand (bypasses deck draw)
function injectHand(engine: GameEngine, player: Player, cardIds: string[]): void

// Create engine with a custom deck (not UNITS_ONLY)
function createTestEngineWithDeck(
  p1Deck: string[], p2Deck: string[], seed?: number
): TestEngine
```

**Why**: Current TestHarness only uses `UNITS_ONLY_DECK_IDS` (31 unit cards, zero spells/structures). This means all spell handlers, structure logic, and COLUMN/DISCARD pending are untestable. `injectHand()` eliminates the silent-skip pattern where tests return early if the desired card isn't in the opening hand.

### I2: In-memory SQLite for server tests (~20 min)

Modify `server/db/database.ts` to accept `DB_PATH` from environment:

```typescript
const DB_PATH = process.env.DB_PATH ?? 'server/data/ocb.sqlite';
```

Server tests set `DB_PATH=:memory:` for isolated, fast, no-cleanup test runs.

### I3: npm scripts + pre-commit (~10 min)

Add to `package.json`:
```json
"test:engine": "vitest run tests/engine --bail=1",
"test:server": "vitest run tests/server --bail=1",
"test:all": "vitest run --bail=3",
"test:ci": "vitest run --reporter=verbose --bail=1"
```

---

## Test Tiers (Priority Order)

### TIER 0: Bug Regression Tests (~3h, ~20 tests)
*Fix bugs first, then write tests that fail on old code and pass on new.*

**File: `tests/engine/abilities/lancerCharge.test.ts`** — 4 tests
- Lancer forward move preserves attack (charge works)
- Lancer backward move forfeits attack (charge denied) — FAILS before B1 fix
- Lancer sideways move forfeits attack
- Non-charge unit backward move is unaffected

**File: `tests/engine/pending/pendingResolution.test.ts`** — 6 tests
- COLUMN selection damages units in column — FAILS before B3 fix
- COLUMN selection on empty column produces no damage events
- DISCARD selection removes card from hand — FAILS before B4 fix
- DISCARD with invalid index is no-op
- TARGET heal resolves correctly (already works, regression guard)
- TARGET with invalid instanceId is no-op

**File: `tests/server/security.test.ts`** — 6 tests
- JWT rejects expired tokens
- JWT rejects wrong-secret tokens
- requireAuth returns 401 without token
- requireAuth returns 401 with invalid token
- sanitize strips HTML tags
- Lobby deck_submitted rejects invalid deck — FAILS before D1 fix

**File: `tests/server/lobbyDefaults.test.ts`** — 4 tests
- Deck timeout substitutes default deck for missing submissions — FAILS before R1 fix
- Default deck passes DeckValidator
- finalizeLaunch sets gameSeed even with default decks
- Both players submitting decks before timeout works normally

### TIER 1: Engine Unit Tests (~10h, ~60 tests)

**File: `tests/engine/phases/counterAttack.test.ts`** — 8 tests
- Defender counter-attacks after surviving
- Defender who dies does NOT counter-attack
- Both units die (mutual destruction)
- Ranged attacker (Archer) immune to counter
- Zero-ATK defender does not counter
- Assassin jump-attack immune to counter
- Counter-attack damage uses defender's current ATK (post-aura)
- Event order: UNIT_ATTACKED (attacker) → UNIT_ATTACKED (counter) → UNIT_DIED (if any)

**File: `tests/engine/auras/auraSystem.test.ts`** — 12 tests
- AdjDef: unit adjacent to structure gets +1 DEF
- BoardHalfDef: Commander in own half gives DEF to friendly units in own half
- BoardHalfAtk: Commander in enemy half gives ATK to friendly units in enemy half
- Commander in neutral zone (row 3): no aura
- PikemanFlank: Pikeman gets ATK bonus when flanking
- KingSuppress: unit adjacent to enemy King gets ATK suppressed to 0
- LEGBonus: King generates bonus LEG
- RoyalDiscount: Princess reduces card costs
- VillageSlow: Village slows enemy units in range
- Aura removal: moving source away removes buff from targets
- Aura stacking: multiple auras compose correctly
- Full chain: all processors run in correct order

**File: `tests/engine/abilities/spellAbilities.test.ts`** — 10 tests
*(Requires `createTestEngineWithDeck` from I1)*
- Earthquake: creates COLUMN pending, player selects column, units take damage
- War Horn: draws 2 cards, creates DISCARD pending, card removed from hand
- Coup: TARGET pending, selected enemy unit destroyed
- Treason: TARGET pending, enemy unit switches sides
- Disease: applies timed effect that ticks each turn
- Reform: spell effect resolves
- Civil War: spell effect resolves
- Peasant Revolt: spell effect resolves
- Casus Belli: spell effect resolves
- Motherland: spell effect resolves

**File: `tests/engine/movement/movementRules.test.ts`** — 10 tests
- OMNI_1: all 8 adjacent squares
- OMNI_2: all squares within 2 (minus occupied)
- STATIC: zero valid moves
- FWD_VERTICAL: forward-only movement
- Custom pattern: Scout diagonal offsets
- Custom pattern: P2 dy-flip (symmetric)
- Path blocking: unit in the way blocks non-jump movement
- Jump movement: skips occupied, lands on empty
- Deploy positions: correct home-half squares
- getValidAttackSquares matches card's attack pattern

**File: `tests/engine/board/board.test.ts`** — 8 tests
- placeUnit at empty cell succeeds
- placeUnit at occupied cell throws
- removeUnit returns removed unit
- removeUnit at empty cell returns null
- moveUnit relocates unit
- getAdjacentUnits returns correct neighbors
- getUnitsInColumn returns all units in column
- serialize produces deep copy (mutating copy doesn't affect original)

**File: `tests/engine/state/playerState.test.ts`** — 8 tests
- drawCards returns cards from deck
- drawCards overflow (hand at limit) puts excess in discard
- drawCardsFiltered returns matching cards
- reshuffleDiscard moves discard back to deck
- handLimit enforcement
- discardFromHand removes correct card
- deck runs out: no crash, returns empty
- LEG management: add, spend, clamp to cap

**File: `tests/engine/state/gameModifiers.test.ts`** — 6 tests
- LEG rate per turn
- LEG cap enforcement
- Royal discount reduces costs
- legRateFrozen flag stops LEG accumulation
- timedEffects tick and expire
- clampPool respects modifiers

### TIER 2: Server Integration Tests (~6h, ~30 tests)

**File: `tests/server/lobbySocket.test.ts`** — 12 tests
*(Real Socket.IO server, similar to roomFlow.test.ts)*
- lobby:create_room creates room with correct fields
- lobby:join_room adds player to existing room
- lobby:join_room with wrong password rejected
- lobby:chat_message broadcasts to room
- lobby:chat rate limit (5/10s) enforced
- lobby:kick removes non-host player
- lobby:kick by non-host rejected
- lobby:update_settings updates room settings
- lobby:update_settings by non-host rejected
- lobby:ready toggles player ready state
- lobby:start_game transitions to 'starting'
- lobby:start_game with unready players rejected

**File: `tests/server/authAPI.test.ts`** — 10 tests
*(Requires I2: in-memory SQLite)*
- GET /api/auth/nonce returns nonce for address
- POST /api/login with valid signature returns JWT
- POST /api/login with invalid signature returns 401
- POST /api/register with valid email creates account
- POST /api/register with duplicate email returns 409
- POST /api/email-login with correct password returns JWT
- POST /api/email-login with wrong password returns 401
- POST /api/email-login rate limit kicks in after 10 attempts
- Authenticated request with valid JWT passes requireAuth
- Expired JWT returns 401

**File: `tests/server/deckAPI.test.ts`** — 8 tests
*(Requires I2: in-memory SQLite + auth token)*
- GET /api/decks returns user's decks
- POST /api/decks creates a new deck
- POST /api/decks with invalid cards returns 400
- PUT /api/decks/:id updates deck
- DELETE /api/decks/:id removes deck
- POST /api/decks/:id/activate sets active deck
- Unauthenticated requests return 401
- Can't access another user's decks

### TIER 3: Safety Nets (~1.5h, ~12 tests)

**File: `tests/engine/data/cardData.test.ts`** — 6 tests
- All card IDs are unique
- All cards have valid CardClass enum
- All cards with abilities have registered handlers
- CardRegistry is frozen (mutations throw)
- UNITS_ONLY_DECK_IDS has exactly 31 cards
- Every CardPool entry matches CardRegistry

**File: `tests/engine/snapshot/goldenSnapshot.test.ts`** — 4 tests
- Initial board state matches snapshot (seed=42)
- State after 1 full turn matches snapshot
- State after deploy + attack matches snapshot
- Snapshot file auto-updates with `UPDATE_SNAPSHOTS=1`

**File: `tests/server/raceConditions.test.ts`** — 2 tests
- Two simultaneous game_actions processed in order (seqNum)
- Rejoin with stale seqNum gets state catch-up

---

## Schedule

| Phase | Items | Tests | Time | Result |
|-------|-------|-------|------|--------|
| **1: Infra** | I1 + I2 + I3 | 13 | 1h | TestHarness enhanced + validated, in-memory DB, npm scripts |
| **2: Bug fixes** | B1 + B3 + B4 + S1 + S2 + D1 + R1 | 0 | 2.5h | All CRITICAL/HIGH bugs + security fixed |
| **3: Regression** | Tier 0 | 20 | 3h | All fixes verified, 0 regressions |
| **4: Engine** | Tier 1 | 60 | 10h | Core engine fully tested |
| **5: Server** | Tier 2 | 30 | 6h | All API + lobby socket tested |
| **6: Safety** | Tier 3 | 12 | 1.5h | Snapshot baselines + data integrity |
| **TOTAL** | | **~135** | **~24h** | 184 → ~319 tests |

### Recommended execution order:
- **Week 1** (Phases 1-3): Fix all bugs + security + regression tests. ~6.5h.
- **Week 2** (Phase 4): Engine unit tests. ~10h.
- **Week 3** (Phases 5-6): Server integration + safety nets. ~7.5h.

---

## What Was Removed From Audit Plan

| Audit Item | Why Removed |
|------------|-------------|
| B2 fix as bug | Assassin works correctly via customAttack — ON_JUMP is dead code cleanup, not a bug |
| 150 new tests target | Inflated due to wrong baseline (171 vs 90). Real target is ~122 new tests. |
| Memory MCP server test | Not applicable — we use file-based memory |
| `test:ci` with Husky pre-commit | Kept npm script but removed Husky — adds dependency for solo dev. Run tests manually before commit. |
| Separate `frontend-design` tests | Not relevant to game engine testing |
| goldenSnapshot auto-update mode | Simplified to env var flag |

## What Was Added

| Item | Why Added |
|------|-----------|
| Spell abilities test file | Audit listed spells as gap but didn't create a dedicated test file — now explicit |
| Aura removal + stacking tests | Bug registry shows aura bugs are recurring (BUG-017, BUG-018) — need dedicated coverage |
| Board.serialize deep copy test | Bug registry BUG-008 — regression guard |
| Lobby defaults test | R1 fallback deck needs its own test file |
| D1 validation in security tests | Deck validation is a security issue, belongs with security baseline |
