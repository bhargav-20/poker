// Procedural sound effects via the Web Audio API — no asset files, so nothing
// to download or bundle. A gesture unlocks the context (browser autoplay rules).
import type { GameEvent } from "@poker/shared";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = typeof localStorage !== "undefined" && localStorage.getItem("poker.muted") === "1";

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

let unlocked = false;

/** Call from a user gesture so audio can play (browser autoplay policy, esp. iOS). */
export function unlockAudio(): void {
  const c = audio();
  if (!c) return;
  if (c.state === "suspended") void c.resume();
  if (!unlocked) {
    // iOS needs a sound started inside the gesture to fully unlock output.
    try {
      const buf = c.createBuffer(1, 1, 22050);
      const src = c.createBufferSource();
      src.buffer = buf;
      src.connect(master ?? c.destination);
      src.start(0);
      unlocked = true;
    } catch {
      /* ignore */
    }
  }
}

export function isMuted(): boolean {
  return muted;
}
export function toggleMuted(): boolean {
  muted = !muted;
  if (typeof localStorage !== "undefined") localStorage.setItem("poker.muted", muted ? "1" : "0");
  return muted;
}

function tone(
  c: AudioContext,
  freq: number,
  t0: number,
  dur: number,
  opts: { type?: OscillatorType; gain?: number; sweepTo?: number } = {},
): void {
  const { type = "sine", gain = 0.2, sweepTo } = opts;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (sweepTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, sweepTo), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(master!);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function noise(
  c: AudioContext,
  t0: number,
  dur: number,
  opts: { gain?: number; type?: BiquadFilterType; freq?: number } = {},
): void {
  const { gain = 0.15, type = "highpass", freq = 2000 } = opts;
  const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(master!);
  src.start(t0);
  src.stop(t0 + dur);
}

export type SoundName =
  | "deal"
  | "chip"
  | "bet"
  | "check"
  | "fold"
  | "win"
  | "turn"
  | "level"
  | "bust";

export function playSound(name: SoundName): void {
  if (muted) return;
  const c = audio();
  if (!c || !master) return;
  const t = c.currentTime;
  switch (name) {
    case "deal":
      noise(c, t, 0.12, { gain: 0.18, type: "highpass", freq: 1800 });
      break;
    case "chip":
      tone(c, 1500, t, 0.05, { type: "triangle", gain: 0.14 });
      tone(c, 2000, t + 0.03, 0.05, { type: "triangle", gain: 0.12 });
      break;
    case "bet":
      tone(c, 1400, t, 0.05, { type: "triangle", gain: 0.15 });
      tone(c, 1900, t + 0.04, 0.05, { type: "triangle", gain: 0.13 });
      tone(c, 2300, t + 0.08, 0.05, { type: "triangle", gain: 0.11 });
      break;
    case "check":
      tone(c, 180, t, 0.09, { type: "sine", gain: 0.32 });
      tone(c, 150, t + 0.12, 0.09, { type: "sine", gain: 0.26 });
      break;
    case "fold":
      noise(c, t, 0.16, { gain: 0.12, type: "lowpass", freq: 1400 });
      break;
    case "win": {
      const notes = [523, 659, 784, 1046];
      notes.forEach((f, i) => tone(c, f, t + i * 0.09, 0.22, { type: "sine", gain: 0.24 }));
      break;
    }
    case "turn":
      tone(c, 880, t, 0.1, { type: "sine", gain: 0.2 });
      tone(c, 1174, t + 0.1, 0.12, { type: "sine", gain: 0.2 });
      break;
    case "level":
      tone(c, 600, t, 0.12, { type: "triangle", gain: 0.2, sweepTo: 900 });
      tone(c, 900, t + 0.12, 0.16, { type: "triangle", gain: 0.2, sweepTo: 1300 });
      break;
    case "bust":
      tone(c, 320, t, 0.35, { type: "sawtooth", gain: 0.18, sweepTo: 120 });
      break;
  }
}

/** Pick a sound for a broadcast game event (null = silent). */
export function soundForEvent(e: GameEvent): SoundName | null {
  switch (e.kind) {
    case "dealHole":
    case "street":
      return "deal";
    case "postBlind":
    case "postAnte":
    case "rebuy":
      return "chip";
    case "action":
      if (e.action === "fold") return "fold";
      if (e.action === "check") return "check";
      if (e.action === "call") return "chip";
      return "bet"; // bet / raise / allin
    case "potAward":
      return "win";
    case "levelUp":
      return "level";
    case "bust":
      return "bust";
    default:
      return null;
  }
}
