/**
 * Lightweight sound effects generated at runtime with the Web Audio API.
 * No audio files are shipped — tones are synthesised on demand, so there is
 * zero network cost and no bundle-size impact.
 *
 * The AudioContext is created lazily on first use (browsers require a user
 * gesture before audio can start, which card taps satisfy).
 */

const STORAGE_KEY = 'solitaire_sound';

let ctx: AudioContext | null = null;
let enabled = loadEnabled();

function loadEnabled(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === null ? true : raw === 'true';
  } catch {
    return true;
  }
}

function getCtx(): AudioContext | null {
  if (!enabled) return null;
  if (!ctx) {
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    } catch {
      return null;
    }
  }
  // Resume if the browser suspended it (common before a user gesture).
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** Play a single short tone with a quick attack and exponential decay. */
function tone(
  freq: number,
  durationMs: number,
  type: OscillatorType = 'sine',
  gain = 0.12,
  startOffset = 0,
) {
  const audio = getCtx();
  if (!audio) return;

  const now = audio.currentTime + startOffset;
  const osc = audio.createOscillator();
  const env = audio.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);

  const dur = durationMs / 1000;
  env.gain.setValueAtTime(0.0001, now);
  env.gain.exponentialRampToValueAtTime(gain, now + 0.008); // fast attack
  env.gain.exponentialRampToValueAtTime(0.0001, now + dur);  // decay

  osc.connect(env);
  env.connect(audio.destination);
  osc.start(now);
  osc.stop(now + dur + 0.02);
}

/** Soft click/tap when moving a card onto a tableau column. */
export function playMove() {
  tone(220, 70, 'triangle', 0.10);
}

/** Brighter two-note chirp when a card lands on a foundation. */
export function playFoundation() {
  tone(523.25, 80, 'sine', 0.12);          // C5
  tone(783.99, 90, 'sine', 0.10, 0.06);    // G5, slightly later
}

/** Short low "flip" sound when drawing from the stock. */
export function playDraw() {
  tone(160, 55, 'square', 0.06);
}

/** Celebratory little arpeggio on winning. */
export function playWin() {
  const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
  notes.forEach((f, i) => tone(f, 260, 'sine', 0.14, i * 0.12));
}

/** Enable/disable all sound. Persisted to localStorage. */
export function setSoundEnabled(on: boolean) {
  enabled = on;
  try {
    localStorage.setItem(STORAGE_KEY, String(on));
  } catch {
    // ignore storage errors
  }
}

export function isSoundEnabled(): boolean {
  return enabled;
}
