// ============================================================
// SoundFX.ts — tiny Web Audio synth for game feedback.
//
// No audio files: every sound is a few oscillators with an envelope,
// so there's nothing to load and nothing to license. The AudioContext
// is created lazily on the first sound (after a user gesture, which
// browsers require). Mute state persists in localStorage.
// ============================================================

export type SoundName =
  | 'deploy' | 'attack' | 'death' | 'heal' | 'turn' | 'error' | 'click' | 'win' | 'lose' | 'draw';

const MUTE_KEY = 'ocb_sfx_muted';
const MIN_GAP_MS = 60;   // collapse bursts (e.g. a full board re-sync after a rejoin)

type Note = { f: number; to?: number; t: number; d: number; type?: OscillatorType; v?: number };

/** Each sound = a list of notes (start offset t, duration d, freq f → to). */
const SOUNDS: Record<SoundName, Note[]> = {
  deploy: [{ f: 330, to: 520, t: 0, d: 0.09, type: 'triangle' }, { f: 520, t: 0.07, d: 0.08, type: 'triangle', v: 0.6 }],
  attack: [{ f: 180, to: 70, t: 0, d: 0.12, type: 'square', v: 0.5 }, { f: 900, to: 200, t: 0, d: 0.05, type: 'sawtooth', v: 0.25 }],
  death:  [{ f: 320, to: 60, t: 0, d: 0.35, type: 'sawtooth', v: 0.35 }],
  heal:   [{ f: 520, to: 780, t: 0, d: 0.18, type: 'sine', v: 0.6 }],
  turn:   [{ f: 660, t: 0, d: 0.35, type: 'sine', v: 0.5 }, { f: 990, t: 0.08, d: 0.35, type: 'sine', v: 0.35 }],
  error:  [{ f: 140, t: 0, d: 0.09, type: 'square', v: 0.3 }],
  click:  [{ f: 1200, t: 0, d: 0.025, type: 'square', v: 0.15 }],
  win:    [523, 659, 784, 1047].map((f, i) => ({ f, t: i * 0.11, d: 0.22, type: 'triangle' as OscillatorType, v: 0.6 })),
  lose:   [392, 330, 262].map((f, i) => ({ f, t: i * 0.16, d: 0.3, type: 'triangle' as OscillatorType, v: 0.5 })),
  draw:   [440, 440].map((f, i) => ({ f, t: i * 0.18, d: 0.2, type: 'sine' as OscillatorType, v: 0.5 })),
};

class SoundFXClass {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private last = new Map<SoundName, number>();
  private _muted: boolean;

  constructor() {
    let m = false;
    try { m = localStorage.getItem(MUTE_KEY) === '1'; } catch { /* storage blocked */ }
    this._muted = m;
  }

  get muted(): boolean { return this._muted; }

  setMuted(m: boolean): void {
    this._muted = m;
    try { localStorage.setItem(MUTE_KEY, m ? '1' : '0'); } catch { /* storage blocked */ }
  }

  toggleMute(): boolean {
    this.setMuted(!this._muted);
    return this._muted;
  }

  play(name: SoundName): void {
    if (this._muted) return;
    const now = performance.now();
    if (now - (this.last.get(name) ?? -Infinity) < MIN_GAP_MS) return;
    this.last.set(name, now);

    const ctx = this.ensureContext();
    if (!ctx || !this.master) return;
    const t0 = ctx.currentTime;
    for (const n of SOUNDS[name]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = n.type ?? 'sine';
      osc.frequency.setValueAtTime(n.f, t0 + n.t);
      if (n.to) osc.frequency.exponentialRampToValueAtTime(n.to, t0 + n.t + n.d);
      const v = n.v ?? 1;
      gain.gain.setValueAtTime(0.0001, t0 + n.t);
      gain.gain.exponentialRampToValueAtTime(v, t0 + n.t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + n.t + n.d);
      osc.connect(gain).connect(this.master);
      osc.start(t0 + n.t);
      osc.stop(t0 + n.t + n.d + 0.02);
    }
  }

  private ensureContext(): AudioContext | null {
    try {
      if (!this.ctx) {
        const Ctor = (window as any).AudioContext ?? (window as any).webkitAudioContext;
        if (!Ctor) return null;
        this.ctx = new Ctor() as AudioContext;
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.22;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return this.ctx;
    } catch {
      return null;
    }
  }
}

export const SoundFX = new SoundFXClass();
