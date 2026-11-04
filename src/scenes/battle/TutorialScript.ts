// ============================================================
// TutorialScript.ts — guided first match, as a pure step machine.
//
// Steps advance on real game events (or a manual "Next"), never on
// timers, so the player can take as long as they like. No Phaser:
// TutorialCoordinator renders it; tests drive it directly.
// ============================================================

export interface TutorialStep {
  id: string;
  title: string;
  text: string;
  /** Show a NEXT button (step has no game action to wait for). */
  manual?: boolean;
  /** Advance when this returns true for an incoming UI event. */
  advanceOn?: (type: string, payload: any, me: number) => boolean;
}

const mine = (p: any, me: number) => p?.activePlayer === me;

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 'welcome', manual: true,
    title: 'Welcome to OnChainBattles',
    text: 'Destroy the enemy King (top of the board) to win. Your King is at the bottom — keep it alive.\nEach turn has two phases: PLAY (cards) and ACT (move/attack).',
  },
  {
    id: 'deploy',
    title: '1 · Deploy a unit',
    text: 'Click a card in your hand (left), then a highlighted square. Cards cost LEG — you have LEG shown top-left.',
    advanceOn: (t, p) => t === 'CARD_PLAYED' && p?.isLocal === true,
  },
  {
    id: 'end_play',
    title: '2 · Finish playing cards',
    text: 'Press TO ACT PHASE (right panel) to leave the PLAY phase and enter the ACT phase.',
    advanceOn: (t, p, me) => t === 'PHASE_CHANGED' && p?.phase === 'ACT' && mine(p, me),
  },
  {
    id: 'end_turn',
    title: '3 · End your turn',
    text: "Units can't act on the turn they're deployed. Press END TURN to pass the turn.",
    advanceOn: (t, p, me) => t === 'TURN_STARTED' && !mine(p, me),
  },
  {
    id: 'bot_turn',
    title: "Opponent's turn",
    text: 'The bot is taking its turn… (In online matches every turn has a 90-second clock shown under the phase button.)',
    advanceOn: (t, p, me) => t === 'TURN_STARTED' && mine(p, me),
  },
  {
    id: 'deploy_again',
    title: '4 · Grow your army',
    text: 'You gain more LEG every turn. Deploy another card if you can, then press TO ACT PHASE.',
    advanceOn: (t, p, me) => t === 'PHASE_CHANGED' && p?.phase === 'ACT' && mine(p, me),
  },
  {
    id: 'act',
    title: '5 · Move and attack',
    text: 'Click one of your units. Green squares = move, red squares = attack. Hover a card to read its abilities.',
    advanceOn: (t) => t === 'UNIT_MOVED' || t === 'UNIT_ATTACKED',
  },
  {
    id: 'finish', manual: true,
    title: "You've got it!",
    text: 'Keep pushing toward the enemy King. From now on the bot fights back. Good luck!',
  },
];

export class TutorialScript {
  private index = 0;
  private finished = false;

  constructor(private readonly me: number, private readonly steps: TutorialStep[] = TUTORIAL_STEPS) {}

  get current(): TutorialStep { return this.steps[Math.min(this.index, this.steps.length - 1)]; }
  get done(): boolean { return this.finished; }
  get stepNumber(): number { return this.index + 1; }
  get totalSteps(): number { return this.steps.length; }

  /** The bot only passes its turns until the player has completed the ACT lesson. */
  get botPassive(): boolean {
    if (this.finished) return false;
    return this.steps.findIndex(s => s.id === 'finish') > this.index;
  }

  /** Feed a UI event; returns true if the step changed. */
  onEvent(type: string, payload: any): boolean {
    if (this.finished) return false;
    const step = this.current;
    if (step.advanceOn?.(type, payload, this.me)) {
      this.next();
      return true;
    }
    return false;
  }

  next(): void {
    if (this.finished) return;
    if (this.index >= this.steps.length - 1) { this.finished = true; return; }
    this.index++;
  }

  skip(): void {
    this.finished = true;
  }
}
