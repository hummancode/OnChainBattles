# CODING PRINCIPLES — OnChainBattles

**Authoritative Reference · March 2026 · Supersedes: OOP Patterns Guide v1**

> This document governs every coding session — human or AI. It is optimized for a solo developer using Claude Code as the primary coding agent. Every rule here exists because it prevents a real problem observed in the OCB codebase or documented in production Claude Code workflows.

---

## 1. FILE SIZE & STRUCTURE

### 1.1 The 500-Line Hard Ceiling

No file exceeds 500 lines. Period.

| File Role | Target LOC | Alarm | Ceiling |
|-----------|-----------|-------|---------|
| Handler / utility / helper | 15–60 | 80 | 100 |
| Component / module / processor | 80–200 | 250 | 300 |
| Coordinator / orchestrator / scene shell | 60–120 | 150 | 200 |
| Data definitions / type files | 100–250 | 350 | 400 |

When a file nears 300 LOC, stop and decompose. Don't wait for 500.

### 1.2 One File, One Job

Every file answers "What does this do?" in one sentence. If the answer has "and" in it, split. The existing violations (AbilityResolver = resolve + define handlers, BattleScene = lifecycle + wiring + HUD + input + network + game-over) are the proof.

### 1.3 Directory Structure Convention

Group by feature, not by technical layer. Each feature folder is self-contained:

```
feature/
  types.ts            ← interfaces, types, contracts
  FeatureRegistry.ts  ← registration / lookup
  FeatureDispatcher.ts ← orchestration / thin router
  handlers/           ← one file per variant
    variantA.ts
    variantB.ts
  helpers/            ← pure utility functions, no side effects
```

### 1.4 Naming Conventions

| Suffix | Meaning | Example |
|--------|---------|---------|
| `*Handler` | Strategy implementation — one behavior | `onDeployDraw.ts` |
| `*Registry` | Map of name → implementation | `AbilityHandlerRegistry.ts` |
| `*Dispatcher` | Looks up handler, calls it | `AbilityDispatcher.ts` |
| `*Coordinator` | Wires multiple systems together | `HUDRefreshCoordinator.ts` |
| `*Bridge` / `*Adapter` | Translates between two interfaces | `EngineEventBridge.ts` |
| `*Factory` | Creates and configures objects | `UnitFactory.ts` |
| `I*` | Interface (contract for dependency inversion) | `IBoard.ts` |

---

## 2. COMPOSITION OVER INHERITANCE

We do not use class inheritance hierarchies. Full stop.

```typescript
// ❌ NEVER
class SpecialUnit extends Unit extends GameEntity { ... }

// ✅ ALWAYS — compose behaviors
class Unit {
  constructor(
    private movement: IMovementStrategy,
    private ability: IAbilityHandler,
    private stats: UnitStats
  ) {}
}
```

Why: In a card game where every card has different behavior, inheritance creates rigid trees. Composition lets us mix-and-match freely. Claude Code also generates better code with composition because each piece can be understood in isolation — no need to trace up a class chain.

---

## 3. DESIGN PATTERNS — THE OCB TOOLKIT

### 3.1 Strategy — For Growing Switch Statements

**Trigger:** A switch/if-else that selects behavior by type, and new types keep being added.

**Structure:** Registry (Map) + Handler interface + one file per handler.

**OCB application (COMPLETED):** AbilityResolver (602 LOC switch) was decomposed into 19 handler files + registry + dispatcher (~60 LOC).

```typescript
// Handler interface — every ability implements this
export interface AbilityHandler {
  (ctx: AbilityContext): AbilityResult;
}

// Registry — Map<string, AbilityHandler>
// Dispatcher — getHandler(type)(ctx), ~30 LOC total
// New card = 1 new file + 1 line in registerAll.ts
```

**Why Claude Code loves this:** Each handler file is 15–35 LOC. Claude can read, understand, and modify a single handler without loading 600 lines of context. Adding a card never touches existing files — zero merge conflicts, zero regression risk.

### 3.2 Command — For Serializable Actions

**Trigger:** You need to queue, replay, undo, log, or send actions over a network.

**Structure:** Command = pure data object (no callbacks). Resolver = interprets command + produces result.

**OCB application (COMPLETED):** PendingInteraction (callback anti-pattern) was replaced with PendingCommand (serializable data).

```typescript
// Command is pure data — serializable, replayable
export interface PendingCommand {
  readonly type: PendingCommandType;
  readonly sourceUnitId: string;
  readonly abilityType: string;
  readonly validTargets: Position[];
  // NO callbacks. NO functions. Just data.
}

// Resolver handles the actual logic
export function resolvePendingCommand(
  command: PendingCommand, selection: Position | string, ctx: AbilityContext
): AbilityResult { ... }
```

**Critical for multiplayer:** Commands go over the socket as JSON. Both clients resolve identically. Replay = re-execute command log. Undo = store previous state alongside command.

### 3.3 Chain of Responsibility — When Order Matters

**Trigger:** Multiple processors that must run in a specific order, each optionally modifying the result.

**OCB application (COMPLETED):** AuraSystem was split into 7 processors + chain (~75 LOC class). Freeze applies before buff calculations.

```typescript
export interface AuraProcessor {
  process(unit: Unit, board: IBoard, modifiers: IGameModifiers): AuraEffect[];
  readonly priority: number;  // lower = runs first
}
// Chain sorts by priority, each processor runs in order
```

### 3.4 Bridge — Two Dimensions of Variation

**Trigger:** N modes × M styles creates combinatorial explosion in one file.

**OCB application (COMPLETED):** CardRenderer (548 LOC) was split into 4 separate renderers (Full, Thumbnail, Detail, Back) + helpers + thin facade.

### 3.5 Adapter — Translating Between Systems

**Trigger:** Two systems emit/consume events in different shapes.

**OCB application (COMPLETED):** EngineEventBridge translates GameEngine events → typed EventBus events. Extracted from BattleScene during Phase 4 decomposition.

### 3.6 State-Driven Rendering (UI as a Function of State)

**Trigger:** UI must reflect game state changes but manually wiring every edge case leads to missed updates.

**Principle:** The UI layer must never hold its own copy of truth. After any state mutation that could affect displayed values, the rendering layer syncs from the engine's authoritative state — not from delta events that may be incomplete.

**OCB application (COMPLETED):** `EngineEventBridge.emitAllUnitStats()` syncs every board unit's stats from `engine.getState()` after every `AURA_APPLIED` event. Previously, only units with non-zero aura deltas were refreshed, causing stale UI when auras were removed (e.g., Messenger moving away from King left King's ATK visually suppressed).

**Rules:**
1. **Engine is the single source of truth.** `unit.currentAtk`, `unit.currentDef`, etc. in `GameEngine.getState()` are always authoritative.
2. **Events signal "something changed", not "here's what changed."** Renderers use events as triggers to re-read state, not as the payload to display.
3. **Prefer full-sync over selective-sync after state mutations.** The cost of emitting stats for ~10-20 units is negligible vs. the bug surface of tracking which units "might have changed."
4. **When adding a new game mechanic that modifies unit stats** (auras, buffs, debuffs, transformations), you do NOT need to update rendering code — the state-driven sync handles it automatically.

**Root cause this prevents:** Any "UI not updating" bug where the engine state is correct but the renderer shows stale values. This entire class of bugs is eliminated by syncing from truth rather than from deltas.

```typescript
// ❌ BEFORE — selective sync, misses removals
case 'AURA_APPLIED':
  for (const change of event.changes) {     // Only non-zero deltas!
    emitStatsChanged(engine, change.instanceId);
  }

// ✅ AFTER — state-driven sync, always correct
case 'AURA_APPLIED':
  emitAllUnitStats(engine);  // Reads ALL units from engine.getState()
```

### 3.7 Typed Observer — The EventBus

**Trigger:** Broadcasting state changes to multiple listeners.

**OCB application (COMPLETED):** EventBus retyped with GameEventMap (35+ events). Misspelled events and wrong payloads are now compile-time errors.

```typescript
interface GameEventMap {
  PHASE_CHANGED: { phase: GamePhase; turn: number };
  UNIT_DEPLOYED: { unit: Unit; position: Position };
  // every event typed once
}

class TypedEventBus {
  on<K extends keyof GameEventMap>(event: K, handler: (payload: GameEventMap[K]) => void): void;
  emit<K extends keyof GameEventMap>(event: K, payload: GameEventMap[K]): void;
}
```

### 3.8 Factory — Centralized Object Creation

**Trigger:** Object construction requires derived fields, defaults, or conditional logic.

**OCB application:** UnitFactory creates units with all derived properties (maxHealth, statusEffects array, ability list) computed in one place.

### 3.9 Interface + Dependency Inversion — For Testability

**Trigger:** You need to test game logic without a real board/renderer/network.

**OCB application (COMPLETED):** IBoard, IPlayerState, IGameModifiers interfaces exist in `src/game/interfaces/`. Board implements IBoard. MockBoard can implement IBoard for testing.

### 3.10 Null Object — Eliminating Null Checks

**Trigger:** A function returns null and every caller must check before using the result.

**OCB application:** TextureHelper returns a valid fallback texture (colored rect), never null. Consumers never check.

### 3.11 Flyweight — Shared Immutable Data

**Trigger:** Many objects reference the same definition data, risk of accidental mutation.

**OCB application:** CardDefinitions frozen with Object.freeze(). 50 units on the board all share the same immutable CardDefinition reference.

---

## 4. PATTERN DECISION FLOWCHART

```
Growing switch/if-else on type?           → Strategy (registry of handlers)
Need to queue/replay/undo/serialize?      → Command (pure data objects)
Multiple processors, order matters?       → Chain of Responsibility
Two independent dimensions of variation?  → Bridge
Two systems with incompatible interfaces? → Adapter
UI must reflect game state after mutation? → State-Driven Rendering (sync from truth)
Broadcasting state changes?               → Typed Observer (EventBus)
Complex object construction?              → Factory
Need to swap real/mock for testing?       → Interface + Dependency Inversion
Returning null, callers always check?     → Null Object
Duplicating immutable data?               → Flyweight
```

---

## 5. ANTI-PATTERNS — THE BLOCKLIST

| Anti-Pattern | What It Looks Like | Required Fix |
|-------------|-------------------|-------------|
| **God File** | Any file > 500 LOC | Decompose: coordinator + extracted pieces |
| **`as any` casting** | `(ctx as any).secret = value` | Define proper interface or extend type |
| **Callback spaghetti** | `pending.callback = (x) => { ... }` | Command pattern with pure data |
| **Untyped events** | `emit('PHSE_CHANGED', data)` | Typed EventMap with generics |
| **Import coupling** | Module A reaches into Module B's internals | Interface between them |
| **Duplicate utilities** | Same `safeImage()` in 3 renderers | Extract to shared helper |
| **Monolithic setup** | 180-line create() method | Split into Coordinator classes |
| **`any` params** | `function resolve(ability: any, params: any)` | Discriminated union types |

---

## 6. AI-OPTIMIZED CODING RULES

These rules exist because they make Claude Code produce better results AND make human review faster. They come from synthesizing Anthropic's official guidance, 12+ community deep-dives, and our own OCB development experience.

### 6.1 Small, Pure, Single-Purpose Functions

Claude Code generates the best code when each function fits in one screen (~40 lines). Pure functions (no side effects, same input → same output) are the easiest for both Claude and humans to reason about.

```typescript
// ✅ Claude generates this correctly on first try
function calculateDamage(attacker: UnitStats, defender: UnitStats): number {
  const baseDamage = Math.max(0, attacker.attack - defender.defense);
  return Math.min(baseDamage, defender.health);
}

// ❌ Claude struggles with this — too many side effects interleaved
function attackAndUpdateBoardAndEmitEventsAndCheckGameOver(...) { ... }
```

### 6.2 Types as Documentation

TypeScript strict mode, zero `any`. Types are the primary documentation for both human and AI readers. When Claude reads a well-typed interface, it generates correct code without additional explanation.

```typescript
// ✅ This interface tells Claude everything it needs
interface AbilityResult {
  events: GameEvent[];
  pending?: PendingCommand;
  stateChanges?: StateChange[];
}

// ❌ This tells Claude nothing
function resolve(ability: any, params: any): any
```

**Policy:** No new code introduces `any`. Existing `any` is eliminated file-by-file during Monday architecture sessions.

### 6.3 Explicit Over Implicit

Never inject properties via `(obj as any).secret = value`. Never rely on convention that isn't enforced by the type system. If Claude can't see the contract in the type definition, it will generate wrong code.

### 6.4 One Export, One Concern Per File

Files with 5+ exports serving different consumers are confusing to Claude and humans alike. If Claude asks "which export should I use?", the file has too many responsibilities.

### 6.5 Predictable File Locations

Claude Code navigates the codebase by reading file paths. Predictable locations reduce context-gathering overhead:

- Game logic → `src/game/`
- Abilities → `src/game/abilities/handlers/`
- Types → `src/game/types/`
- Scene coordination → `src/scenes/battle/`
- Rendering → `src/renderers/`
- Shared interfaces → `src/game/interfaces/`

When Claude knows where to find things, it reads fewer files and preserves more context for actual work.

---

## 7. CLAUDE CODE WORKFLOW RULES

### 7.1 Plan Before Code

Every task involving 2+ files starts with a plan. The plan is reviewed before any code is written. This reduces architecture errors by 45% on multi-file tasks.

```
Step 1: "Plan the refactoring of X. Do NOT write code yet."
Step 2: Review plan, challenge assumptions, correct direction.
Step 3: "Execute step 1 of the plan." (one step at a time)
Step 4: Verify, then proceed to next step.
```

### 7.2 Atomic Tasks

Break work into 5–10 minute chunks. Claude handles a series of precise subtasks far better than one vague mega-task. Each subtask should be completable and verifiable independently.

```
❌ "Refactor the ability system"
✅ "Create the AbilityHandler interface in src/game/abilities/types.ts"
✅ "Move the onDeployDraw case into src/game/abilities/handlers/onDeployDraw.ts"
✅ "Create registerAll.ts and register the first 5 handlers"
```

### 7.3 Context Hygiene

Context degradation is the primary failure mode of AI coding. Rules:

- Clear context (`/clear`) when starting a new task
- Don't let old conversation context pollute new work
- If a session has been going for 30+ minutes on different topics, clear and restart
- Reference files by path, don't paste entire contents unless necessary
- Write progress to a file before clearing, so the next session can pick up

### 7.4 Commit After Each Completed Step

Each step that compiles and works gets its own commit. This is insurance — if a later step goes wrong, we revert to the last good state, not back to the beginning. Use conventional commit format: `refactor: Phase 1 — AbilityHandler registry + first 5 handlers`.

### 7.5 Verify Immediately

After every code change, run verification:

```bash
npx tsc --noEmit          # Type safety
# Manual: play one game    # Functional correctness
```

Never proceed to step N+1 if step N has errors. Fix first, then continue.

---

## 8. CODE CHANGE PROTOCOL

How code changes are communicated between AI and human:

### 8.1 Small Changes (≤30% of a file)

Show OLD function → NEW function, with file path. Human searches for OLD, replaces with NEW.

```
📁 src/game/GameEngine.ts — function playCard()

OLD:
─────
private pending: PendingInteraction | null = null;

NEW:
─────
private pending: PendingCommand | null = null;
```

### 8.2 Large Changes (>70% of a file)

Rewrite the entire file. State clearly: "FULL REWRITE of src/game/abilities/AbilityDispatcher.ts"

### 8.3 New Files

State: "NEW FILE: src/game/abilities/handlers/onDeployDraw.ts" followed by complete contents.

### 8.4 Always Include

- File path (directory + filename)
- Function or class name where the change occurs
- Any import changes
- Brief reason for the change (one line)

---

## 9. CODEBASE HEALTH — CURRENT STATE (Post-Refactoring)

All 11 architecture phases from `OCB_Architecture_ActionPlan_FINAL_v5.md` are **COMPLETE**. The codebase has been fully restructured. Here is what exists now.

### 9.1 Completed Refactors (Done — Preserve These Patterns)

| Phase | What Was Done | Current State |
|-------|-------------|---------------|
| 1. AbilityResolver → Strategy | Deleted 602 LOC monolith | 19 handler files in `src/game/abilities/handlers/` + Registry + Dispatcher (~60 LOC) |
| 2. Typed EventBus | GameEventMap with 35+ typed events | `src/events/EventBus.ts` — zero `any` payloads, 5 real bugs caught |
| 3. PendingCommand | Removed callback anti-pattern | `src/game/pending/PendingCommand.ts` + `PendingCommandResolver.ts` — serializable, no `(ctx as any)` |
| 4. BattleScene Decomposition | Split 496 LOC monolith | 5 coordinators in `src/scenes/battle/` + thin shell (~120 LOC) |
| 5. CardRenderer Split | Split 548 LOC monolith | 4 renderers in `src/renderers/` + helpers + thin facade |
| 6. CardDefinitions Restructure | Extracted data concerns | `src/game/data/` — CardRegistry (frozen), DeckDefinitions, MovementPresets |
| 7. Interface Extraction | Added dependency inversion | `src/game/interfaces/` — IBoard, IPlayerState, IGameModifiers |
| 8. AuraSystem Chain | Split 270 LOC monolith | 7 processors + chain + helpers, class ~75 LOC |
| 9. Server TypeScript | Converted JS monolith | 4 TS files: app.ts, RoomManager, SessionManager, PayoutService + shared NetworkEvents |
| 10. Renderer Utilities | Extracted shared helpers | `src/renderers/helpers/` — TextureHelper, ButtonFactory, CardLayoutCalc |
| 11. GameState Cleanup | Replaced legacy types | BoardGameResult replaces MatchResult+MatchState, zero `as any` casts |

### 9.2 Original Good Modules (Still Good)

| Module | Pattern | Status |
|--------|---------|--------|
| GameContext.ts | Mediator | Preserved — clean state/orchestration separation |
| UnitFactory.ts | Factory | Preserved — single creation point, derived props |
| UnitQuery.ts | Specification | Preserved — pure boolean predicates |
| phases/*.ts | Template Method | Preserved — pure functions, same contract |
| PlayerState.ts | Entity | Preserved — hand/deck/discard with seeded shuffle |
| CombatResolver.ts | Pure Functions | Preserved — clean dying-blow mechanic |
| SelectionManager.ts | State Machine + DIP | Preserved — uses IGameEngineAPI |
| DeckLoader.ts | Lazy Loader | Preserved — JSON-driven with fallback |

### 9.3 Current Open Issues (From Post-Refactoring Audit)

| Priority | Issue | Files | Status |
|----------|-------|-------|--------|
| CRITICAL | Server trusts client `game_over` — fake winner exploit | `server/game/SessionManager.ts` | Open |
| CRITICAL | No server-side action validation — turn injection, action spam | `server/game/SessionManager.ts`, `RoomManager.ts` | Open |
| HIGH | No wallet proof-of-ownership — payout redirect | `server/rooms/RoomManager.ts` | Open |
| HIGH | EngineEventBridge memory leak — no cleanup on scene shutdown | `src/scenes/battle/EngineEventBridge.ts` | Open |
| HIGH | AbilityDispatcher has no error boundary — handler throw crashes phase | `src/game/abilities/AbilityDispatcher.ts` | Open |
| MEDIUM | 8× `(engine as any).getState()` in coordinators — needs IGameEngineReadonly | Battle coordinators | Open |
| MEDIUM | Deep freeze needed for CardRegistry nested objects | `src/game/data/CardRegistry.ts` | Open |

### 9.4 File Size Status

All 500+ LOC monoliths are eliminated. Current ceiling target: 350 LOC per file. No file should regress past this.

---

## 10. WEEKLY DISCIPLINE

**Monday = Architecture Day.** 3–4 hours of refactoring, tech debt, pattern enforcement. Never skip this. It's what keeps month-12 velocity from collapsing.

**Before every coding session:** Re-read the relevant section of this document. Which pattern applies? What's the file size situation?

**After every coding session:** Did any file grow past 300 LOC? Did we introduce `any`? Did we add a case to a switch that should be a registry? Fix it now, not later.

---

## APPENDIX: Patterns We Intentionally Skip

| Pattern | Why We Don't Use It |
|---------|-------------------|
| Deep inheritance | Card entities vary by composition, not class trees |
| Visitor | Double-dispatch complexity not justified; Strategy is simpler |
| Decorator | Buff stacking deferred; current modifier system is adequate |
| Event Sourcing | Deferred to spectator mode phase; Command is the stepping stone |
| Singleton (global mutable) | We have implicit singletons; adding more creates hidden coupling |

---

*This guide is the architectural constitution of OnChainBattles. When in doubt, compose — don't inherit. When a file grows — split, don't scroll. When a switch grows — extract, don't add cases. When Claude generates code — types are the documentation, small files are the context window, pure functions are the safety net.*
