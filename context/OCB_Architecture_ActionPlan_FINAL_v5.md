# OnChainBattles — FINAL Composite Architecture Action Plan v5

**March 2026 · Supersedes v3 (docx) + v4 (md) · For Claude Code AI Agent + Human Developer**

> **How to use this document:**
> - **Human**: Read Sections 1-3 for understanding. Skim Section 4 for the plan. Review checkpoints.
> - **Claude Code**: Execute Section 4 step-by-step. Each step has: action, exact code, verification, checkpoint.
> - **Progress Tracking**: Each step has a `[ ]` checkbox. Mark `[x]` when complete.

---

# SECTION 1: AUDIT SUMMARY

## 1.1 What's Already Good (DO NOT TOUCH these)

| File | Pattern | Why It's Good |
|------|---------|--------------|
| GameContext.ts | Mediator Context | Clean state/orchestration separation |
| UnitFactory.ts | Factory Method | Single creation point, derived props |
| UnitQuery.ts | Specification | Pure boolean predicates, extensible |
| phases/*.ts (5 files) | Template Method | Pure functions, same contract |
| PlayerState.ts | Entity | Hand/deck/discard with seeded shuffle |
| GameModifiers.ts | Value Object + State | Clean computed properties |
| CombatResolver.ts | Pure Functions | Dying-blow mechanic, clean events |
| SelectionManager.ts | State Machine + DIP | Uses IGameEngineAPI interface |
| DeckLoader.ts | Lazy Loader | JSON-driven with fallback |

## 1.2 What Needs Fixing (Ranked by Impact)

| # | File | LOC | Core Problem | Target Pattern |
|---|------|-----|-------------|----------------|
| P0.1 | AbilityResolver.ts | 602 | Giant switch, OCP violation | Strategy + Registry |
| P0.2 | EventBus.ts | ~100 | All payloads `any`, bypassed EV constants | Typed Observer |
| P0.3 | PendingInteraction | ~50 | Callback anti-pattern, not serializable | Command |
| P1.1 | BattleScene.ts | 520 | 7+ responsibilities, 180-line create() | Coordinators |
| P1.2 | CardRenderer.ts | 480 | 3 renderers in 1 class | Bridge Split |
| P1.3 | CardDefinitions.ts | ~450 | Defs + registry + deck + presets in 1 file | Type Object + Flyweight |
| P2.1 | AuraSystem.ts | 200 | Switch for aura types, empty wrapper class | Chain of Responsibility |
| P2.2 | server/index.js | 230 | Plain JS, no types, dead dice-roll code | Repository + Adapter |
| P2.3 | Board/PlayerState/GameModifiers | N/A | No interfaces, can't mock | Dependency Inversion |
| P2.4 | Renderers (multiple) | ~80 dup | Duplicate safeImage, hexToNum, buttons | Null Object + DRY |
| P2.5 | GameState.ts | ~120 | Untyped global bag, `(as any)` injection | Value Object |
| P2.6 | MatchState.ts | ~30 | Legacy dice-roll fields | Replace with BoardGameResult |
| P2.7 | PatternResolver.ts | ~100 | Dead code (duplicates MovementRules) | DELETE |
| P2.8 | SocketManager.ts | ~200 | Dead sendDiceRoll(), untyped events | Clean + Adapter |

## 1.3 Anti-Patterns Found (Line-Level Detail)

1. **`params(ab: any): any`** — AuraSystem.ts. Every ability param access is untyped.
2. **`(ctx as any)._lastPending`** — GameEngine.playCard(). Secret property injection.
3. **`'CAVALRY' as any`** — CombatResolver.ts + AuraSystem.ts. SubType enum mismatch.
4. **Dual OFFSETS_*`** — MovementRules.ts AND PatternResolver.ts export identical tables.
5. **AuraSystem class = empty wrapper** — Both methods just call standalone function.
6. **`wireEngineToEventBus(engine: any)`** — BattleScene. 130 LOC of untyped wiring.
7. **Module-scope sanity check** — UNITS_ONLY_DECK_IDS.length !== 31 logs but continues.

## 1.4 OOP Patterns — Complete Mapping

### Already Present (10 patterns)

Singleton, Observer (untyped), Facade, Type Object, Factory Method, State Machine, Mediator, DTO, Template Method, Lazy Loading

### Adding in This Plan (8 patterns)

Strategy (Phase 1), Command (Phase 3), Chain of Responsibility (Phase 8), Bridge (Phase 5), Adapter (Phase 4), Repository/Interface (Phase 7), Null Object (Phase 10), Flyweight (Phase 6)

### Deferred to Future (5 patterns)

Decorator (buff stacking), Specification (targeting DSL), Dirty Flag (aura optimization), Event Sourcing (replay), Object Pool (renderer perf)

---

# SECTION 2: TARGET ARCHITECTURE

## 2.1 Target Directory Structure

```
src/
  game/
    abilities/                        ← NEW (Phase 1)
      types.ts                        (~30 LOC)
      AbilityHandlerRegistry.ts       (~30 LOC)
      AbilityDispatcher.ts            (~60 LOC)
      registerAll.ts                  (~25 LOC)
      handlers/                       ← One file per ability (~15-35 LOC each)
        onDeployDraw.ts
        onDeployScout.ts
        onDeployHeal.ts
        onDeployRevive.ts
        spellDamageStructure.ts
        spellFreezeLeg.ts
        spellDrainLeg.ts
        spellForwardDeploy.ts
        spellTransformAll.ts
        spellEarthquake.ts
        spellDrawStructures.ts
        spellWarHorn.ts
        spellCoup.ts
        spellTreason.ts
        spellRevolt.ts
        spellMotherland.ts
        customMystic.ts
        customMilitia.ts
        passiveNoOp.ts
    data/                             ← SPLIT (Phase 6)
      CardDefinitions.ts              (~200 LOC, definitions only)
      CardRegistry.ts                 (~40 LOC, CARD_MAP + getCard)
      DeckDefinitions.ts              (~40 LOC, deck lists)
      MovementPresets.ts              (~60 LOC, offset tables + custom patterns)
    interfaces/                       ← NEW (Phase 7)
      IBoard.ts
      IPlayerState.ts
      IGameModifiers.ts
    pending/                          ← NEW (Phase 3)
      PendingCommand.ts               (~50 LOC)
      PendingCommandResolver.ts       (~80 LOC)
    types/
      GameEventMap.ts                 ← NEW (Phase 2, ~80 LOC)
      ... (existing type files)
    phases/                           (existing, good)
    Board.ts                          (add: implements IBoard)
    GameEngine.ts                     (~250 LOC, trimmed)
    GameContext.ts                    (existing, good)
    ... (existing files)
  scenes/
    battle/                           ← NEW (Phase 4)
      BattleScene.ts                  (~80 LOC shell)
      EngineEventBridge.ts            (~130 LOC)
      NetworkCoordinator.ts           (~80 LOC)
      HUDRefreshCoordinator.ts        (~50 LOC)
      InputCoordinator.ts             (~80 LOC)
      GameOverHandler.ts              (~40 LOC)
  renderers/
    CardFullRenderer.ts               ← SPLIT (Phase 5, ~150 LOC)
    CardThumbnailRenderer.ts          (~120 LOC)
    CardDetailRenderer.ts             (~100 LOC)
    CardBackRenderer.ts               (~40 LOC)
    helpers/
      TextureHelper.ts                (~40 LOC)
      ButtonFactory.ts                (~60 LOC)
      CardLayoutCalc.ts               (~40 LOC)
  events/
    EventBus.ts                       (retyped, Phase 2)
```

## 2.2 File Size Targets

| File (Before) | Before | After | Method |
|---------------|--------|-------|--------|
| AbilityResolver.ts | 602 | DELETED | Strategy → 17 handlers |
| BattleScene.ts | 520 | ~80 | 5 coordinators |
| CardRenderer.ts | 480 | DELETED | Bridge → 4 renderers |
| CardDefinitions.ts | ~450 | ~200 | Split registry/decks/presets |
| GameEngine.ts | ~500 | ~250 | Pending + playCard cleaned |
| server/index.js | 230 | DELETED | 4 TypeScript files |
| AuraSystem.ts | 200 | ~80 | Chain processors |
| PatternResolver.ts | ~100 | DELETED | Dead code |

**Result: Zero files > 350 LOC. All 500+ LOC files eliminated.**

---

# SECTION 3: PATTERN RATIONALE

Why each pattern was chosen for each problem:

| Pattern | Problem It Solves | Alternative Considered | Why This Wins |
|---------|------------------|----------------------|--------------|
| **Strategy** (AbilityResolver) | 25+ switch cases grow with every card | Visitor pattern | Strategy is simpler — no double dispatch needed. Handlers are pure functions, not class hierarchies. |
| **Command** (PendingInteraction) | Callbacks not serializable for replay | State machine with enum | Command carries all context as data. Serializable. Replayable. Undoable. |
| **Chain of Responsibility** (AuraSystem) | Switch for aura types grows linearly | Strategy again | Chain is better because aura order matters (some buffs must apply before others). Chain preserves ordering. |
| **Bridge** (CardRenderer) | 4 render modes × 4 card styles tangled | Inheritance hierarchy | Bridge avoids combinatorial explosion. Mode and style vary independently. |
| **Adapter** (EngineEventBridge) | Engine events ≠ EventBus events | Direct coupling | Adapter formalizes the translation layer. Typed on both sides. |
| **Repository + Interface** (Board) | Direct imports block mocking | Dependency injection only | Interface is the lightweight version — no DI container needed. Just swap concrete for mock in tests. |
| **Null Object** (TextureHelper) | safeImage returns null → null checks everywhere | Optional chaining | Null Object returns a valid fallback (colored rect). Consumers never check for null. |
| **Flyweight** (CardDefinitions) | Shared objects could be accidentally mutated | Deep clone on access | Object.freeze is zero-cost at runtime. Mutation throws in strict mode. |

---

# SECTION 4: STEP-BY-STEP EXECUTION PLAN

> **For Claude Code Agent**: Execute each numbered step sequentially. After each CHECKPOINT, run the verification commands. If any check fails, fix the issue before proceeding. Mark `[x]` on completion.

## PHASE 1: AbilityResolver → Strategy Pattern + Registry

**Goal**: Replace 602 LOC switch with registry of small handler files.
**Estimated time**: ~4 hours
**Dependencies**: None (can start immediately)
**Git branch**: `refactor/phase1-ability-strategy`

### Step 1.1: Create directory structure
```bash
mkdir -p src/game/abilities/handlers
```
- [ ] Directory exists

### Step 1.2: Create `src/game/abilities/types.ts`

Create NEW file with this exact content:

```typescript
import type { Unit, Position } from '../types/GameTypes';
import { Player } from '../types/GameTypes';
import type { Board } from '../Board';
import type { PlayerState } from '../PlayerState';
import type { GameModifiers } from '../GameModifiers';
import type { GameEvent } from '../types/EventTypes';
import type { PendingInteraction } from '../types/AbilityTypes';

export interface AbilityResult {
  events: GameEvent[];
  pending?: PendingInteraction;
}

export interface AbilityContext {
  readonly cardId: string;
  readonly owner: Player;
  readonly position?: Position;
  readonly board: Board;
  readonly players: [PlayerState, PlayerState];
  readonly mods: [GameModifiers, GameModifiers];
  readonly unit?: Unit;
  readonly params: Record<string, unknown>;
}

export type AbilityHandlerFn = (ctx: AbilityContext) => AbilityResult;
```

- [ ] File created and TypeScript-valid

### Step 1.3: Create `src/game/abilities/AbilityHandlerRegistry.ts`

Create NEW file with this exact content:

```typescript
import type { AbilityHandlerFn } from './types';

class Registry {
  private readonly handlers = new Map<string, AbilityHandlerFn>();

  register(key: string, handler: AbilityHandlerFn): void {
    if (this.handlers.has(key)) {
      console.warn(`[AbilityRegistry] Overwriting handler: ${key}`);
    }
    this.handlers.set(key, handler);
  }

  get(key: string): AbilityHandlerFn | undefined {
    return this.handlers.get(key);
  }

  has(key: string): boolean {
    return this.handlers.has(key);
  }

  listKeys(): string[] {
    return Array.from(this.handlers.keys());
  }
}

export const AbilityHandlerRegistry = new Registry();
```

- [ ] File created and TypeScript-valid

### Step 1.4: Extract each handler from AbilityResolver.ts

For EACH row in the table below, create a handler file. The handler function body comes from the corresponding lines in `src/game/AbilityResolver.ts`.

**HANDLER EXTRACTION TABLE:**

| New File | AbilityType/Handler Key | Source Lines (in codebase.md) | Notes |
|----------|------------------------|------------------------------|-------|
| `handlers/onDeployDraw.ts` | ON_DEPLOY_DRAW | 5176-5190 | Draw N cards with optional filter |
| `handlers/onDeployScout.ts` | ON_DEPLOY_SCOUT_DECK | 5192-5204 | Peek opponent deck |
| `handlers/onDeployHeal.ts` | ON_DEPLOY_HEAL_FRIENDLY | 5206-5221 | Returns PendingInteraction TARGET |
| `handlers/onDeployRevive.ts` | ON_DEPLOY_REVIVE | 5223-5248 | Returns PendingInteraction TARGET + LEG drain |
| `handlers/spellDamageStructure.ts` | SPELL_DAMAGE_STRUCTURE_ADJ | 5250-5265 | Disease: PendingInteraction TARGET |
| `handlers/spellFreezeLeg.ts` | SPELL_FREEZE_LEG_RATE | 5267-5279 | Civil War: both players frozen |
| `handlers/spellDrainLeg.ts` | SPELL_DRAIN_LEG_RATE_PERM | 5281-5295 | Casus Belli: permanent LEG drain |
| `handlers/spellForwardDeploy.ts` | SPELL_FORWARD_DEPLOY | 5297-5315 | Casus Belli: deploy to enemy row |
| `handlers/spellTransformAll.ts` | SPELL_TRANSFORM_ALL | 5317-5322 | Reform: foot_soldier → swordsman |
| `handlers/spellEarthquake.ts` | SPELL_EARTHQUAKE | 5324-5332 | PendingInteraction COLUMN |
| `handlers/spellDrawStructures.ts` | SPELL_DRAW_STRUCTURES | 5334-5350 | Motherland: draw per structure |
| `handlers/customMystic.ts` | mysticDeployHandler | 5427-5457 | Revive + LEG drain |
| `handlers/customMilitia.ts` | militiaDeployHandler | 5459-5485 | Pull militia from deck |
| `handlers/spellWarHorn.ts` | warHornHandler | 5489-5508 | Draw 2, discard 1, +1 move |
| `handlers/spellCoup.ts` | coupHandler | 5511-5534 | Target enemy Royal |
| `handlers/spellTreason.ts` | treasonHandler | 5536-5557 | Take control non-Royal |
| `handlers/spellRevolt.ts` | peasantRevoltHandler | 5559-5598 | Summon militia per structure |
| `handlers/spellMotherland.ts` | motherlandHandler | 5600-5619 | Draw per own structure |
| `handlers/passiveNoOp.ts` | All PASSIVE_*, AURA_*, ON_DEATH_DRAW, ON_KILL_LEG_DRAIN | 5352-5369 | Returns { events: [] } |

**Pattern for each handler file:**

```typescript
// src/game/abilities/handlers/[name].ts
import { AbilityHandlerRegistry } from '../AbilityHandlerRegistry';
import { AbilityType } from '../../types/AbilityTypes';
import type { AbilityContext, AbilityResult } from '../types';
// ... any other imports needed for this specific handler

function handlerName(ctx: AbilityContext): AbilityResult {
  // ... logic extracted from AbilityResolver.ts switch case
  // Replace references:
  //   owner     → ctx.owner
  //   board     → ctx.board
  //   ps        → ctx.players
  //   mods      → ctx.mods
  //   params    → ctx.params
  //   unit      → ctx.unit
  //   position  → ctx.position
}

AbilityHandlerRegistry.register(AbilityType.XXX, handlerName);
// OR for custom handlers:
// AbilityHandlerRegistry.register('mysticDeployHandler', handlerName);
```

- [ ] All 19 handler files created
- [ ] Each handler file < 40 LOC

### Step 1.5: Create `src/game/abilities/AbilityDispatcher.ts`

Create NEW file — this is the thin replacement for the entire old AbilityResolver.ts. Use the complete code from **Section 2, v4 document, Step 1.4** (the `resolveOnDeploy`, `resolveOnDeath`, `resolveOnKill` functions).

- [ ] File created with all three exported functions
- [ ] File < 80 LOC

### Step 1.6: Create `src/game/abilities/registerAll.ts`

Create NEW file with one import line per handler:

```typescript
import './handlers/onDeployDraw';
import './handlers/onDeployScout';
import './handlers/onDeployHeal';
import './handlers/onDeployRevive';
import './handlers/spellDamageStructure';
import './handlers/spellFreezeLeg';
import './handlers/spellDrainLeg';
import './handlers/spellForwardDeploy';
import './handlers/spellTransformAll';
import './handlers/spellEarthquake';
import './handlers/spellDrawStructures';
import './handlers/spellWarHorn';
import './handlers/spellCoup';
import './handlers/spellTreason';
import './handlers/spellRevolt';
import './handlers/spellMotherland';
import './handlers/customMystic';
import './handlers/customMilitia';
import './handlers/passiveNoOp';
// ↓ ADD NEW HANDLERS HERE ↓
```

- [ ] File created

### Step 1.7: Update import sites

**In `src/game/phases/PlayPhase.ts`:**
```
OLD: import { resolveOnDeploy } from '../AbilityResolver';
NEW: import { resolveOnDeploy } from '../abilities/AbilityDispatcher';
```

**In `src/game/phases/ActPhase.ts`:**
```
OLD: import { resolveOnDeath, resolveOnKill } from '../AbilityResolver';
NEW: import { resolveOnDeath, resolveOnKill } from '../abilities/AbilityDispatcher';
```

**In `src/main.ts` (add at top, after other imports):**
```
ADD: import './game/abilities/registerAll';
```

- [ ] All 3 files updated

### Step 1.8: Delete old files

```bash
# Verify PatternResolver.ts is unused:
grep -rn 'PatternResolver' src/
# If only self-references or zero results → safe to delete

rm src/game/AbilityResolver.ts
rm src/game/PatternResolver.ts  # dead code
```

- [ ] AbilityResolver.ts deleted
- [ ] PatternResolver.ts deleted (if confirmed unused)

### ✅ CHECKPOINT 1 — Phase 1 Complete

```bash
# All must pass:
grep -rn 'AbilityResolver' src/           # Expected: 0 results
ls src/game/abilities/handlers/*.ts | wc -l  # Expected: >= 17
wc -l src/game/abilities/AbilityDispatcher.ts  # Expected: < 80
npx tsc --noEmit                           # Expected: pass (or same errors as before)

# Manual smoke test:
# npm start → Start battle → Deploy Priest → Heal target selection appears
# Play Earthquake → Column selection appears
# Deploy Foot Soldier → Kill it → On Death draw triggers
```

- [ ] All grep checks pass
- [ ] TypeScript compiles
- [ ] Manual smoke test passes
- [ ] **Git commit**: `refactor: Phase 1 — AbilityResolver → Strategy Pattern (17 handlers)`

---

## PHASE 2: Typed EventBus

**Goal**: Every event wiring bug becomes compile-time error.
**Estimated time**: ~3 hours
**Dependencies**: None
**Git branch**: `refactor/phase2-typed-eventbus`

### Step 2.1: Create `src/game/types/GameEventMap.ts`

Create NEW file with typed payload for EVERY event. Use the complete GameEventMap interface from v4 Section 5 (includes all 30+ event types with full payload shapes).

- [ ] File created with all event types

### Step 2.2: Retype EventBus.ts

**In `src/events/EventBus.ts`:**

Change the `emit` signature:
```
OLD: emit<T = any>(type: string, payload?: T): void
NEW: emit<K extends GameEventType>(type: K, payload: GameEventMap[K]): void
```

Change the `on` signature:
```
OLD: on<T = any>(type: string, handler: EventHandler<T>): () => void
NEW: on<K extends GameEventType>(type: K, fn: (payload: GameEventMap[K]) => void): () => void
```

Add import at top:
```typescript
import type { GameEventMap, GameEventType } from '../game/types/GameEventMap';
```

- [ ] Both signatures updated
- [ ] Import added

### Step 2.3: Fix all compile errors surfaced

After retyping EventBus, `npx tsc --noEmit` will reveal every place that emits or listens to events with wrong types. Fix each one. This is the whole point — the compiler is now catching real bugs.

- [ ] All type errors fixed

### ✅ CHECKPOINT 2 — Phase 2 Complete

```bash
npx tsc --noEmit                           # Expected: pass
grep -c ': any' src/events/EventBus.ts     # Expected: 0 (in new code)
grep -l 'GameEventMap' src/events/EventBus.ts  # Expected: found
```

- [ ] All checks pass
- [ ] **Git commit**: `refactor: Phase 2 — Typed EventBus with GameEventMap`

---

## PHASE 3: PendingCommand → Command Pattern

**Goal**: Remove callback anti-pattern. Make interactions serializable.
**Estimated time**: ~3 hours
**Dependencies**: Phase 1 complete
**Git branch**: `refactor/phase3-pending-command`

### Step 3.1: Create `src/game/pending/PendingCommand.ts`

```typescript
import type { Position } from '../types/GameTypes';
import type { GameEvent } from '../types/EventTypes';

export type PendingCommand =
  | { kind: 'TARGET'; sourceCardId: string; sourceAbility: string;
      validTargetIds: string[]; reason: string; deferredEvents: GameEvent[] }
  | { kind: 'POSITION'; sourceCardId: string; sourceAbility: string;
      validPositions: Position[]; reason: string; deferredEvents: GameEvent[] }
  | { kind: 'COLUMN'; sourceCardId: string; sourceAbility: string;
      reason: string; deferredEvents: GameEvent[] }
  | { kind: 'DISCARD'; sourceCardId: string; sourceAbility: string;
      count: number; reason: string; deferredEvents: GameEvent[] };
```

- [ ] File created

### Step 3.2: Create `src/game/pending/PendingCommandResolver.ts`

Pure function: `resolve(command, selection, ctx) → GameEvent[]`

This replaces the callback-based resolution in GameEngine.selectTarget/selectPosition/selectColumn/selectDiscard.

- [ ] File created

### Step 3.3: Update AbilityDispatcher + handler files

Handler files that return `pending` with `resumeCallback: () => {}` must instead return `PendingCommand` (no callback).

- [ ] All handlers updated

### Step 3.4: Update GameEngine.ts

Replace:
```
OLD: private pending: PendingInteraction | null = null;
NEW: private pending: PendingCommand | null = null;
```

Replace all `selectTarget/selectPosition/selectColumn/selectDiscard` methods to use `PendingCommandResolver.resolve()` instead of calling `cb(selection)`.

Remove `(ctx as any)._lastPending` pattern from `playCard()`.

- [ ] GameEngine updated

### ✅ CHECKPOINT 3 — Phase 3 Complete

```bash
grep -rn 'resumeCallback' src/            # Expected: 0 results
grep -rn '_lastPending' src/              # Expected: 0 results
npx tsc --noEmit                          # Expected: pass

# Manual: Deploy Priest → Heal selection → Select target → Heals correctly
# Manual: Play Earthquake → Column selection → Damage applied
# Manual: War Horn → Draw 2 → Discard selection → +1 move applied
```

- [ ] All checks pass
- [ ] **Git commit**: `refactor: Phase 3 — PendingCommand replaces callbacks`

---

## PHASE 4: BattleScene Decomposition

**Goal**: Split 520 LOC monolith into 6 focused files.
**Estimated time**: ~4 hours
**Dependencies**: Phase 2 complete (bridge uses typed events)
**Git branch**: `refactor/phase4-battlescene-split`

### Step 4.1: Create `src/scenes/battle/` directory
```bash
mkdir -p src/scenes/battle
```

### Step 4.2: Extract EngineEventBridge.ts

Move `wireEngineToEventBus()` function (~130 LOC) from BattleScene to new file. Type the `engine` parameter properly (not `any`).

- [ ] File created, engine parameter typed

### Step 4.3: Extract NetworkCoordinator.ts

Extract socket callbacks + replayOpponentAction + handleOpponentDisconnect.

- [ ] File created

### Step 4.4: Extract HUDRefreshCoordinator.ts

Extract refreshHUD closure.

- [ ] File created

### Step 4.5: Extract InputCoordinator.ts

Extract SelectionManager setup + callback implementations.

- [ ] File created

### Step 4.6: Extract GameOverHandler.ts

Extract GAME_OVER listener + ResultScene transition.

- [ ] File created

### Step 4.7: Rewrite BattleScene.ts as thin shell

```typescript
create(): void {
  const layout = await LayoutLoader.load('BattleScene');
  const theme = await ThemeLoader.load('BattleScene');
  this.engine = new GameEngine();
  wireEngineToEventBus(this.engine, GameState.playerIndex);
  this.boardRenderer = new BoardRenderer(this, layout, theme);
  // ... other renderers ...
  this.network = new NetworkCoordinator(this.engine, SocketManager, this);
  this.input = new InputCoordinator(this.engine, this);
  this.hudRefresh = new HUDRefreshCoordinator(this.engine, this.hudRenderer);
  this.gameOver = new GameOverHandler(this.engine, this);
  [this.network, this.input, this.hudRefresh, this.gameOver].forEach(c => c.setup());
  this.engine.startGame();
}
```

- [ ] BattleScene.ts < 100 LOC

### ✅ CHECKPOINT 4 — Phase 4 Complete

```bash
wc -l src/scenes/battle/BattleScene.ts    # Expected: < 100
ls src/scenes/battle/*.ts | wc -l          # Expected: >= 6
npx tsc --noEmit                           # Expected: pass

# Manual: Full game plays normally through BattleScene
```

- [ ] All checks pass
- [ ] **Git commit**: `refactor: Phase 4 — BattleScene → 6 coordinator files`

---

## PHASE 5: CardRenderer → Bridge Pattern Split

**Goal**: Split 480 LOC into 4 renderers + helpers.
**Estimated time**: ~3 hours
**Dependencies**: None
**Git branch**: `refactor/phase5-card-renderer-split`

### Step 5.1-5.5: Extract into 5 files

| Extract | From | To | ~LOC |
|---------|------|----|------|
| `renderFull()` + state overlays | CardRenderer.ts | CardFullRenderer.ts | ~150 |
| `renderThumbnail()` + HP bar + badges | CardRenderer.ts | CardThumbnailRenderer.ts | ~120 |
| `renderDetail()` + pattern diagram | CardRenderer.ts | CardDetailRenderer.ts | ~100 |
| `renderBack()` | CardRenderer.ts | CardBackRenderer.ts | ~40 |
| `makeBadge()`, `safeImage()` | CardRenderer.ts | helpers/CardRenderHelpers.ts | ~50 |

Each renderer: `constructor(scene: Phaser.Scene, theme: ThemeJSON)`

- [ ] All 5 files created
- [ ] Old CardRenderer.ts deleted
- [ ] All import sites updated

### ✅ CHECKPOINT 5 — Phase 5 Complete

```bash
grep -rn 'CardRenderer' src/ --include='*.ts' | grep -v 'CardFullRenderer\|CardThumbnailRenderer\|CardDetailRenderer\|CardBackRenderer\|CardRenderHelpers'
# Expected: 0 results (no references to old monolith)
npx tsc --noEmit

# Manual: Cards render in hand (full), on board (thumbnail), in detail overlay, face-down (back)
```

- [ ] **Git commit**: `refactor: Phase 5 — CardRenderer → Bridge split (4 renderers + helpers)`

---

## PHASE 6: CardDefinitions Restructure

**Goal**: Flatten definitions, extract registry/decks/presets.
**Estimated time**: ~2 hours
**Dependencies**: Phase 1 (registry references getCard)
**Git branch**: `refactor/phase6-card-definitions-split`

### Step 6.1: Create `src/game/data/CardRegistry.ts`

Move CARD_MAP, getCard() from CardDefinitions.ts. Freeze definitions:

```typescript
export const CARD_MAP: ReadonlyMap<string, Readonly<CardDefinition>> = new Map(
  CARD_DEFINITIONS.map(c => [c.id, Object.freeze(c)])
);
```

- [ ] File created

### Step 6.2: Create `src/game/data/DeckDefinitions.ts`

Move UNITS_ONLY_DECK_IDS, DEMO_DECK_IDS.

- [ ] File created

### Step 6.3: Create `src/game/data/MovementPresets.ts`

Extract PATTERN_ARCHER_ATTACK, PATTERN_ASSASSIN_MOVE, PATTERN_ASSASSIN_ATTACK. Also move OFFSETS_OMNI, OFFSETS_HV, OFFSETS_DIAGONAL from MovementRules.ts.

- [ ] File created

### Step 6.4: Flatten inline patterns in CardDefinitions.ts

Replace Archer/Assassin inline offset objects with imports from MovementPresets.ts.

- [ ] CardDefinitions.ts < 250 LOC
- [ ] All card definitions are flat 8-12 line objects

### Step 6.5: Update all import sites

Files importing `getCard` from `'../data/CardDefinitions'` → `'../data/CardRegistry'`

- [ ] All imports updated

### ✅ CHECKPOINT 6 — Phase 6 Complete

```bash
wc -l src/game/data/CardDefinitions.ts    # Expected: < 250
ls src/game/data/*.ts                      # Expected: 4+ files
npx tsc --noEmit

# Verify Flyweight: In a test file or console, check Object.isFrozen(getCard('king')) === true
```

- [ ] **Git commit**: `refactor: Phase 6 — CardDefinitions split + Flyweight freeze`

---

## PHASE 7: Interface Extraction

**Goal**: Dependency Inversion for core game subsystems.
**Estimated time**: ~3 hours
**Dependencies**: Phases 1-6 stable
**Git branch**: `refactor/phase7-interfaces`

### Step 7.1: Create `src/game/interfaces/IBoard.ts`

Extract all public method signatures from Board.ts into interface.

### Step 7.2: Create `src/game/interfaces/IPlayerState.ts`

### Step 7.3: Create `src/game/interfaces/IGameModifiers.ts`

### Step 7.4: Update Board.ts, PlayerState.ts, GameModifiers.ts

Add `implements IBoard`, `implements IPlayerState`, `implements IGameModifiers`.

### Step 7.5: Update consumers

Phase modules, CombatResolver, AuraSystem, AbilityDispatcher → import interfaces.

### ✅ CHECKPOINT 7

```bash
ls src/game/interfaces/I*.ts              # Expected: 3 files
npx tsc --noEmit
```

- [ ] **Git commit**: `refactor: Phase 7 — IBoard, IPlayerState, IGameModifiers interfaces`

---

## PHASE 8: AuraSystem → Chain of Responsibility

**Goal**: Replace aura type switch with processor chain.
**Estimated time**: ~3 hours
**Dependencies**: Phase 7 (uses IBoard)
**Git branch**: `refactor/phase8-aura-chain`

### Step 8.1: Define AuraProcessor interface

```typescript
export interface AuraProcessor {
  readonly auraType: string;
  process(source: Unit, allUnits: Unit[], board: IBoard, deltas: Map<string, StatDelta>): void;
}
```

### Step 8.2: Create processor files

One per aura type: AdjDefProcessor, BoardHalfDefProcessor, BoardHalfAtkProcessor, VillageSlowProcessor, PikemanFlankProcessor, etc.

### Step 8.3: Create AuraProcessorChain

Replaces the switch in evaluateAuras.

### Step 8.4: Make AuraSystem a real class (not empty wrapper)

Add `private chain: AuraProcessor[]` field. Constructor builds the chain.

### ✅ CHECKPOINT 8

```bash
ls src/game/auras/processors/*.ts | wc -l  # Expected: >= 5
wc -l src/game/AuraSystem.ts               # Expected: < 100
npx tsc --noEmit
```

- [ ] **Git commit**: `refactor: Phase 8 — AuraSystem → Chain of Responsibility`

---

## PHASE 9: Server TypeScript Migration

**Goal**: Convert plain JS server to typed TypeScript modules.
**Estimated time**: ~4 hours
**Dependencies**: None (can parallel with phases 5-8)
**Git branch**: `refactor/phase9-server-typescript`

### Step 9.1: Create `shared/types/NetworkEvents.ts`

Shared client+server event contracts.

### Step 9.2: Create `server/app.ts` (~40 LOC)

Bootstrap Express + Socket.io.

### Step 9.3: Create `server/rooms/RoomManager.ts` (~80 LOC)

Room CRUD, player tracking.

### Step 9.4: Create `server/game/SessionManager.ts` (~60 LOC)

Game seed, action relay, settlement.

### Step 9.5: Create `server/game/PayoutService.ts` (~50 LOC)

Escrow contract interaction.

### Step 9.6: Delete dead dice-roll code

Remove `diceRoll` socket handler (server lines 4014-4067 in codebase.md). Remove `sendDiceRoll()` from SocketManager.ts.

### Step 9.7: Delete `server/index.js`

### ✅ CHECKPOINT 9

```bash
ls server/*.ts server/**/*.ts              # Expected: 4+ TypeScript files
grep -rn 'sendDiceRoll' src/               # Expected: 0
grep -rn 'diceRoll' server/                # Expected: 0
npx tsc --noEmit
```

- [ ] **Git commit**: `refactor: Phase 9 — Server TypeScript migration + dice-roll removal`

---

## PHASE 10: Renderer Utilities

**Goal**: Extract shared helpers, eliminate duplication.
**Estimated time**: ~2 hours
**Dependencies**: Phase 5 (split renderers exist)
**Git branch**: `refactor/phase10-renderer-helpers`

### Step 10.1: Create `src/renderers/helpers/TextureHelper.ts`

Shared `safeImage()` with Null Object fallback (colored rect, never null).

### Step 10.2: Create `src/renderers/helpers/ButtonFactory.ts`

Unify HUDRenderer.makeButton() and MenuButton patterns.

### Step 10.3: Create `src/renderers/helpers/CardLayoutCalc.ts`

Shared card spacing used by HandRenderer and HUDRenderer.

### ✅ CHECKPOINT 10

```bash
ls src/renderers/helpers/*.ts              # Expected: 3 files
npx tsc --noEmit
```

- [ ] **Git commit**: `refactor: Phase 10 — Renderer helpers (TextureHelper, ButtonFactory, CardLayoutCalc)`

---

## PHASE 11: GameState Cleanup

**Goal**: Remove legacy fields, type the global bag.
**Estimated time**: ~2 hours
**Dependencies**: None (can parallel)
**Git branch**: `refactor/phase11-gamestate-cleanup`

### Step 11.1: Create `src/data/BoardGameResult.ts`

Replace MatchResult (removes playerRoll/opponentRoll):

```typescript
export interface BoardGameResult {
  playerName: string;
  opponentName: string;
  playerWon: boolean;
  reason: string;       // 'KING_KILLED' | 'OPPONENT_DISCONNECTED' | etc.
  turns: number;
  stakeAmount: number;
  payout: number;
}
```

### Step 11.2: Update GameState.ts

- Replace `lastMatch: MatchResult` → `lastMatch: BoardGameResult`
- Add typed fields: `depositTxHash: string | null`, `payoutResult: PayoutResult | null`, `lastMatchExtra: MatchExtra | null`
- Remove all `(GameState as any).xxx` patterns
- Make fields readonly where appropriate

### Step 11.3: Delete or replace MatchState.ts

### Step 11.4: Update MainMenuScene

`renderLastMatchBanner()` → show turns/reason instead of roll results.

### ✅ CHECKPOINT 11

```bash
grep -rn 'playerRoll' src/                # Expected: 0
grep -rn '(GameState as any)' src/        # Expected: 0
grep -rn 'MatchState' src/                # Expected: 0 or only BoardGameResult
npx tsc --noEmit
```

- [ ] **Git commit**: `refactor: Phase 11 — GameState cleanup + BoardGameResult`

---

# SECTION 5: MASTER VERIFICATION

After ALL phases complete, run the full suite:

```bash
echo "=== TYPE SAFETY ==="
npx tsc --noEmit && echo "PASS" || echo "FAIL"

echo "=== FILE SIZES ==="
find src/ -name '*.ts' -exec wc -l {} + | sort -rn | head -20
echo "(No file should exceed 300 LOC)"

echo "=== DEAD CODE ==="
for pattern in 'AbilityResolver' 'PatternResolver' 'resumeCallback' '_lastPending' 'sendDiceRoll' 'playerRoll' 'opponentRoll'; do
  count=$(grep -rn "$pattern" src/ | wc -l)
  echo "$pattern: $count (expected 0)"
done

echo "=== STRATEGY PATTERN ==="
echo "Handler count: $(ls src/game/abilities/handlers/*.ts 2>/dev/null | wc -l) (expected >= 17)"
echo "Dispatcher LOC: $(wc -l < src/game/abilities/AbilityDispatcher.ts) (expected < 80)"

echo "=== TYPED EVENTBUS ==="
grep -c 'GameEventMap' src/events/EventBus.ts && echo "PASS" || echo "FAIL"

echo "=== INTERFACES ==="
ls src/game/interfaces/I*.ts 2>/dev/null | wc -l && echo "interfaces found"

echo "=== BATTLESCENE ==="
echo "BattleScene LOC: $(wc -l < src/scenes/battle/BattleScene.ts) (expected < 100)"
echo "Coordinator files: $(ls src/scenes/battle/*.ts | wc -l) (expected >= 6)"
```

### Manual Smoke Tests

1. `npm start` → Main menu loads
2. Start battle → Board renders, cards in hand
3. Deploy Priest → Heal target selection appears → Select → Heals
4. Play Earthquake → Column selection → Damage applied
5. War Horn → Draw 2 → Discard 1 → +1 move
6. Kill Foot Soldier → On Death: draw 1 triggers
7. Lancer → Move forward → Attack same turn (charge)
8. Kill enemy King → GAME_OVER → ResultScene
9. **10-Line Card Test**: Add a dummy card, start game, verify it works, remove it

---

# SECTION 6: NEW CARD ADDITION GUIDE

## Existing Ability (~10 lines, 0 new files)

```typescript
// In src/game/data/CardDefinitions.ts:
{
  id: 'battle_mage', name: 'Battle Mage',
  flavorText: 'Arcane might on the front lines.',
  class: U, allegiance: ROY, subtypes: [], cost: 6, copies: 2,
  stats: { atk: 4, def: 3, movement: MovementType.OMNI_1,
    attackPattern: AtkPattern.STRAIGHT_RANGED_3 },
  flags: [],
  abilities: [
    { type: AbilityType.ON_DEPLOY_DRAW, params: { count: 1 } },
  ],
  abilityText: 'Ranged 3. On Deploy: draw 1 card.',
},
```

Also: add to deck, add art placeholders, add to PreloadScene card list. **Zero logic files edited.**

## New Ability (~30 lines, 1 new file)

1. Add enum value to AbilityTypes.ts (1 line)
2. Create `src/game/abilities/handlers/spellChainLightning.ts` (~20 lines)
3. Add import to `registerAll.ts` (1 line)
4. Add card definition (~10 lines)

**Zero edits to existing logic files. Zero switch statements.**

---

# SECTION 7: PROGRESS TRACKER

| Phase | Status | Commit Hash | Date | Notes |
|-------|--------|-------------|------|-------|
| 1. AbilityResolver → Strategy | [ ] | | | |
| 2. Typed EventBus | [ ] | | | |
| 3. PendingCommand | [ ] | | | |
| 4. BattleScene Decomposition | [ ] | | | |
| 5. CardRenderer Split | [ ] | | | |
| 6. CardDefinitions Restructure | [ ] | | | |
| 7. Interface Extraction | [ ] | | | |
| 8. AuraSystem Chain | [ ] | | | |
| 9. Server TypeScript | [ ] | | | |
| 10. Renderer Utilities | [ ] | | | |
| 11. GameState Cleanup | [ ] | | | |

**Total estimated: ~33 hours across 11 phases.**

---

*OnChainBattles · Final Composite Architecture Action Plan v5 · March 2026*
