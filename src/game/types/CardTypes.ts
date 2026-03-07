// ============================================================
// CardTypes.ts
// All card-related enums and interfaces.
// Zero runtime logic — pure type definitions only.
// This is the contract every other game file builds against.
// ============================================================

// ─────────────────────────────────────────────
// ENUMS
// ─────────────────────────────────────────────

export enum CardClass {
  UNIT      = 'UNIT',
  SPELL     = 'SPELL',
  STRUCTURE = 'STRUCTURE',
}

export enum Allegiance {
  STANDARD = 'STANDARD',
  ROYAL    = 'ROYAL',
}

export enum SubType {
  CAVALRY   = 'CAVALRY',
  STRUCTURE = 'STRUCTURE',
  // SOLDIER, NOBLE reserved for future expansion
}

export enum CardFlag {
  BUILD_DELAY     = 'BUILD_DELAY',     // Structure placed inactive for 1 turn
  LANCER_CHARGE   = 'LANCER_CHARGE',   // May MOVE + ATTACK in same ACT phase
  CAVALRY_COUNTER = 'CAVALRY_COUNTER', // Pikeman: x3 ATK vs isCavalry
  TAUNT_ROW       = 'TAUNT_ROW',       // Enemies must attack this unit if in range
}

export enum MovementType {
  OMNI_1          = 'OMNI_1',          // 1 step any direction (8 squares)
  OMNI_2          = 'OMNI_2',          // 2 steps any direction
  OMNI_3          = 'OMNI_3',          // 3 steps any direction
  VERTICAL_2      = 'VERTICAL_2',      // 2 steps forward/back only
  JUMP_DIAGONAL_1 = 'JUMP_DIAGONAL_1', // Assassin: jump to diagonal, ignores occupied
  FWD_VERTICAL_1  = 'FWD_VERTICAL_1',  // 1 step forward only (future: Vanguard)
  STATIC          = 'STATIC',          // Cannot move (Castle, Temple, Village)
}

export enum AtkPattern {
  HV               = 'HV',               // Horizontal/Vertical melee (4 squares)
  OMNI             = 'OMNI',             // All 8 adjacent squares melee
  DIAGONAL_RANGED_2= 'DIAGONAL_RANGED_2',// Archer: diagonal up to 2 squares, bypasses adjacency
  STRAIGHT_RANGED_3= 'STRAIGHT_RANGED_3',// Siege Tower: straight 3 (future)
  ON_JUMP          = 'ON_JUMP',          // Assassin: attacks landing square on jump
  AREA_ADJ         = 'AREA_ADJ',         // Castle: attacks all 8 adjacent squares simultaneously
  FWD_VERTICAL     = 'FWD_VERTICAL',     // Forward only (future: Vanguard)
  NONE             = 'NONE',             // Cannot attack (Princess, Temple, Messenger, Scribe)
}

// ─────────────────────────────────────────────
// UNIT STATS (base values on CardDefinition)
// ─────────────────────────────────────────────

export interface UnitStats {
  atk: number;
  def: number;
  movement: MovementType;
  attackPattern: AtkPattern;
  // NEW: optional custom overrides — if present, these replace the enum logic
  customMove?: CustomPattern;
  customAttack?: CustomPattern;
}
export interface PatternOffset {
  dx: number;   // column offset (-1 = left, +1 = right)
  dy: number;   // row offset (-1 = toward enemy, +1 = toward own half)
}
export interface CustomPattern {
  offsets: PatternOffset[];   // which squares relative to unit
  range?: number;             // max steps per direction (default 1)
  canJump?: boolean;          // ignore blocking units (default false)
  requiresEnemy?: boolean;    // only valid if enemy present (for attacks)
}

// ─────────────────────────────────────────────
// CARD DEFINITION
// ─────────────────────────────────────────────

export interface CardDefinition {
  id: string;                  // 'foot_soldier', 'knights_guard'
  name: string;                // Display name
  flavorText?: string;         // Optional lore line
  class: CardClass;
  allegiance: Allegiance;
  subtypes: SubType[];
  cost: number;                // Base LEG cost
  copies: number;              // Max copies per deck: 1, 2, or 3
  stats?: UnitStats;           // Present on UNIT and STRUCTURE, absent on SPELL
  flags: CardFlag[];
  abilities: Array<CommonAbility | CustomAbility>;
  abilityText?: string;        // Human-readable description for UI rendering
}

// ─────────────────────────────────────────────
// ABILITY SYSTEM TYPES (referenced by CardDefinition)
// Full definitions live in AbilityTypes.ts
// ─────────────────────────────────────────────

export interface CommonAbility {
  type: string;                // AbilityType enum value
  params: Record<string, any>;
}

export interface CustomAbility {
  type: 'CUSTOM';
  handler: string;             // Handler key — resolved in AbilityResolver
}
