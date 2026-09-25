import type { EmberCostume } from "@shared/wardrobe";
import { emberPref } from "./emberPrefs";

/**
 * Ember's voice: every noise she makes, and her catchphrases.
 *
 * **Synthesised, not recorded.** Every sound effect is built here out of an
 * oscillator or a burst of noise - a bonk is a square wave falling, a whoosh
 * is noise swept through a filter, the coin is two notes. Nothing to ship,
 * nothing to license, and every one of them is a few lines you can read and
 * retune. It is also the right sound for her: a pixel character with a
 * recorded voice is a sticker on a video game; chiptune is her own voice.
 *
 * **The catchphrases are spoken**, by the machine's own voice, pitched up for
 * her and bent for whoever she is being: a squeak for "Hee-hee!", a growl for
 * "I'm Batman". That is the Talking Tom trick - his joke was never the words,
 * it was the voice they came out in.
 *
 * She only makes a sound because of something you did: a poke, a throw, a
 * task finished. What she gets up to on her own is silent, because a noise
 * nobody asked for, in a working day, is the fastest way to get switched off.
 * The caller decides that; this file only checks the switch in Settings.
 */

export type Sfx =
  | "ayo" | "beat" | "beep" | "boing" | "bonk" | "boop" | "bugle" | "burn" | "cheer" | "clang" | "click" | "coin" | "coo"
  | "crackle" | "dab" | "ding" | "drum" | "dun" | "fanfare" | "fifth" | "flap" | "giggle" | "hee" | "hi" | "hiya" | "hmm"
  | "hum" | "item" | "march" | "munch" | "plink" | "poof" | "pop" | "punch" | "riff" | "robot" | "rocket" | "slide" | "splat" | "swell" | "swish" | "thud"
  | "thwip" | "tok" | "tweet" | "twang" | "up" | "whirr" | "whistle" | "whoop" | "whoosh" | "yeehaw" | "zap";

let audio: AudioContext | null = null;
let master: GainNode | null = null;

function context(): { ctx: AudioContext; out: GainNode } | null {
  try {
    if (!audio) {
      audio = new AudioContext();
      master = audio.createGain();
      // Quiet on purpose. She is a small thing on a desk, not an alarm.
      master.gain.value = 0.22;
      master.connect(audio.destination);
    }
    if (audio.state === "suspended") void audio.resume();
    return master ? { ctx: audio, out: master } : null;
  } catch {
    // No audio device, or a test window without one. Silence is correct.
    return null;
  }
}

/** One note: a wave from one pitch to another, shaped so it starts and stops without a click. */
function tone(
  from: number,
  to: number,
  seconds: number,
  { at = 0, type = "square", level = 0.5 }: { at?: number; type?: OscillatorType; level?: number } = {},
): void {
  const got = context();
  if (!got) return;
  const { ctx, out } = got;
  const start = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, start);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), start + seconds);
  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.exponentialRampToValueAtTime(level, start + Math.min(0.01, seconds / 4));
  amp.gain.exponentialRampToValueAtTime(0.0001, start + seconds);
  osc.connect(amp).connect(out);
  osc.start(start);
  osc.stop(start + seconds + 0.02);
}

/** A burst of noise through a filter: thuds, whooshes, smoke, crackle. */
function hiss(
  seconds: number,
  { at = 0, freq = 1000, to = freq, kind = "bandpass", level = 0.6 }: { at?: number; freq?: number; to?: number; kind?: BiquadFilterType; level?: number } = {},
): void {
  const got = context();
  if (!got) return;
  const { ctx, out } = got;
  const start = ctx.currentTime + at;
  const length = Math.ceil(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = kind;
  filter.frequency.setValueAtTime(freq, start);
  filter.frequency.exponentialRampToValueAtTime(Math.max(1, to), start + seconds);
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(level, start);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + seconds);
  source.connect(filter).connect(amp).connect(out);
  source.start(start);
}

/** Notes in a row: a jingle, a fanfare, four famous notes. */
function tune(notes: readonly (readonly [number, number])[], type: OscillatorType = "square", level = 0.35): void {
  let at = 0;
  for (const [freq, seconds] of notes) {
    tone(freq, freq, seconds * 0.95, { at, type, level });
    at += seconds;
  }
}

const C5 = 523.25, E5 = 659.25, G5 = 783.99, C6 = 1046.5, G4 = 392, EB4 = 311.13, E4 = 329.63, F4 = 349.23, GS4 = 415.3, A4 = 440;

const RECIPES: Record<Sfx, () => void> = {
  pop: () => tone(500, 950, 0.07),
  boing: () => {
    tone(140, 620, 0.28, { type: "triangle", level: 0.6 });
    tone(620, 300, 0.2, { at: 0.28, type: "triangle", level: 0.3 });
  },
  bonk: () => {
    tone(420, 110, 0.14, { level: 0.5 });
    hiss(0.06, { freq: 900, kind: "lowpass" });
  },
  // Two bars of a drum machine under a dance: kick, snare, hats, and a bass
  // line that walks. Long enough for most of a dance, short enough to stop.
  beat: () => {
    const bar = 0.46;
    for (let n = 0; n < 8; n += 1) {
      const at = n * (bar / 2);
      if (n % 2 === 0) tone(120, 45, 0.16, { at, type: "sine", level: 0.9 });
      else hiss(0.1, { at, freq: 1800, level: 0.55 });
      hiss(0.03, { at: at + bar / 4, freq: 7000, kind: "highpass", level: 0.25 });
      const bass = [110, 110, 146.8, 130.8][Math.floor(n / 2) % 4] ?? 110;
      tone(bass, bass, bar / 2.4, { at, type: "square", level: 0.12 });
    }
  },
  robot: () => [0, 0.09, 0.18].forEach((at, n) => tone([880, 660, 990][n] ?? 880, [880, 660, 990][n] ?? 880, 0.07, { at, type: "square", level: 0.2 })),
  // The dab: a swipe and a hit.
  dab: () => {
    hiss(0.12, { freq: 800, to: 4000, level: 0.5 });
    tone(160, 60, 0.18, { at: 0.08, type: "sine", level: 0.9 });
  },
  // A web shooting out: a short bright hiss and a rising flick.
  thwip: () => {
    hiss(0.09, { freq: 5000, to: 9000, kind: "highpass", level: 0.6 });
    tone(900, 2400, 0.08, { type: "triangle", level: 0.3 });
  },
  // A small, unreliable rocket.
  rocket: () => {
    hiss(1.1, { freq: 300, to: 1400, kind: "lowpass", level: 0.9 });
    for (let n = 0; n < 10; n += 1) hiss(0.02, { at: Math.random() * 1, freq: 3500, kind: "highpass", level: 0.4 });
  },
  // Flat against a wall: a wet slap, then a sad little slide down in pitch.
  splat: () => {
    hiss(0.18, { freq: 1400, to: 250, kind: "lowpass", level: 1 });
    tone(260, 70, 0.3, { type: "sine", level: 0.8 });
    tone(900, 500, 0.08, { at: 0.02, type: "square", level: 0.15 });
  },
  thud: () => {
    tone(110, 40, 0.25, { type: "sine", level: 0.9 });
    hiss(0.15, { freq: 400, kind: "lowpass", level: 0.8 });
  },
  tweet: () => [0, 0.11, 0.22, 0.4, 0.51].forEach((at) => tone(2100, 2900, 0.06, { at, type: "sine", level: 0.3 })),
  hee: () => {
    tone(1150, 1500, 0.12, { type: "sawtooth", level: 0.25 });
    tone(1200, 1650, 0.14, { at: 0.18, type: "sawtooth", level: 0.25 });
  },
  giggle: () => [0, 0.08, 0.16, 0.24, 0.32].forEach((at, n) => tone(800 + (n % 2) * 180, 950 + (n % 2) * 180, 0.06, { at, type: "sine" })),
  cheer: () => tune([[C5, 0.08], [E5, 0.08], [G5, 0.08], [C6, 0.3]]),
  poof: () => hiss(0.3, { freq: 1800, to: 400, level: 0.7 }),
  whoosh: () => hiss(0.4, { freq: 300, to: 2600, level: 0.6 }),
  swish: () => hiss(0.16, { freq: 2500, to: 5000, kind: "highpass", level: 0.4 }),
  zap: () => {
    tone(1600, 90, 0.25, { type: "sawtooth", level: 0.4 });
    hiss(0.25, { freq: 3000, kind: "highpass", level: 0.3 });
  },
  punch: () => {
    hiss(0.08, { freq: 1500, kind: "lowpass", level: 0.9 });
    tone(200, 60, 0.12, { type: "sine", level: 0.8 });
  },
  ding: () => {
    tone(1320, 1320, 0.7, { type: "sine", level: 0.5 });
    tone(2640, 2640, 0.4, { type: "sine", level: 0.15 });
  },
  fanfare: () => tune([[G4, 0.12], [C5, 0.12], [E5, 0.12], [G5, 0.45]]),
  // The four most famous notes there are. G, G, G, and the long E flat.
  fifth: () => tune([[G4, 0.14], [G4, 0.14], [G4, 0.14], [EB4, 0.8]], "sawtooth", 0.3),
  twang: () => {
    tone(330, 320, 0.5, { type: "sawtooth", level: 0.3 });
    tone(165, 160, 0.5, { type: "sawtooth", level: 0.2 });
  },
  coin: () => tune([[987.77, 0.08], [1318.5, 0.35]]),
  hum: () => {
    tone(110, 112, 0.7, { type: "sawtooth", level: 0.25 });
    tone(55, 56, 0.7, { type: "square", level: 0.12 });
  },
  drum: () => {
    tone(130, 45, 0.3, { type: "sine", level: 1 });
    hiss(0.08, { freq: 600, kind: "lowpass", level: 0.5 });
  },
  munch: () => [0, 0.12].forEach((at) => hiss(0.05, { at, freq: 900, level: 0.8 })),
  crackle: () => {
    for (let n = 0; n < 12; n += 1) hiss(0.02, { at: Math.random() * 0.6, freq: 3000, kind: "highpass", level: 0.5 });
  },
  burn: () => {
    hiss(1.6, { freq: 500, to: 200, kind: "lowpass", level: 0.7 });
    for (let n = 0; n < 24; n += 1) hiss(0.02, { at: Math.random() * 1.5, freq: 3000, kind: "highpass", level: 0.4 });
  },
  // A cartoon fall: the long slide down that means the ground is coming.
  whistle: () => tone(2600, 380, 1.4, { type: "sine", level: 0.35 }),
  flap: () => [0, 0.12, 0.24, 0.36].forEach((at) => hiss(0.06, { at, freq: 500, kind: "lowpass", level: 0.6 })),
  hi: () => tone(700, 1100, 0.12, { type: "sine" }),
  click: () => {
    hiss(0.03, { freq: 4000, kind: "highpass", level: 0.7 });
    hiss(0.04, { at: 0.08, freq: 3000, kind: "highpass", level: 0.5 });
  },
  whoop: () => tone(380, 1300, 0.22, { type: "sine" }),
  hmm: () => tone(210, 180, 0.45, { type: "triangle", level: 0.4 }),
  slide: () => hiss(0.5, { freq: 3500, to: 2500, level: 0.25 }),
  coo: () => [0, 0.3].forEach((at) => tone(420, 340, 0.22, { at, type: "sine", level: 0.4 })),
  bugle: () => tune([[C5, 0.1], [E5, 0.1], [G5, 0.1], [C6, 0.5]], "sawtooth", 0.25),
  dun: () => {
    tone(98, 98, 0.35, { type: "triangle", level: 0.8 });
    tone(92.5, 92.5, 0.6, { at: 0.4, type: "triangle", level: 0.8 });
  },
  riff: () => tune([[E4, 0.12], [F4, 0.12], [GS4, 0.12], [A4, 0.12], [GS4, 0.12], [F4, 0.12], [E4, 0.3]], "square", 0.25),
  march: () => tune([[C5, 0.12], [C5, 0.12], [G5, 0.12], [E5, 0.4]], "square", 0.3),
  plink: () => tune([[C6, 0.1], [G5, 0.1], [E5, 0.1], [C5, 0.2]], "triangle", 0.4),
  // Four rising notes, arms up, something held to the sky.
  item: () => tune([[A4, 0.12], [466.16, 0.12], [493.88, 0.12], [C5, 0.6]], "square", 0.3),
  yeehaw: () => tone(600, 1300, 0.3, { type: "triangle" }),
  ayo: () => tone(400, 620, 0.35, { type: "triangle" }),
  hiya: () => {
    tone(700, 1400, 0.25, { type: "sawtooth", level: 0.2 });
    hiss(0.3, { freq: 800, to: 3000, level: 0.4 });
  },
  tok: () => {
    hiss(0.03, { freq: 2500, level: 0.9 });
    tone(900, 700, 0.06, { type: "sine", level: 0.5 });
  },
  whirr: () => {
    for (let n = 0; n < 6; n += 1) hiss(0.07, { at: n * 0.09, freq: 700, to: 1400, level: 0.5 });
  },
  swell: () => [C5, E5, G5].forEach((freq) => tone(freq / 2, freq / 2, 1.6, { type: "sawtooth", level: 0.08 })),
  up: () => tone(300, 950, 0.35, { type: "triangle" }),
  boop: () => tune([[500, 0.1], [700, 0.14]], "sine", 0.4),
  clang: () => {
    tone(1600, 1550, 0.3, { type: "square", level: 0.2 });
    tone(2130, 2100, 0.3, { type: "square", level: 0.15 });
  },
  beep: () => [0, 0.14].forEach((at) => tone(1000, 1000, 0.08, { at, type: "sine", level: 0.3 })),
};

export function chirp(sound: Sfx): void {
  if (!emberPref("sound")) return;
  try {
    RECIPES[sound]();
  } catch {
    // A sound that could not be made is a sound nobody misses.
  }
}

/**
 * How each of them sounds when they talk. Pitch and speed only - the words
 * come from the machine's own voice, bent. Ember herself squeaks.
 */
const VOICES: Partial<Record<EmberCostume, { pitch: number; rate: number }>> = {
  mj: { pitch: 2, rate: 1.35 },
  batman: { pitch: 0.1, rate: 0.75 },
  zeus: { pitch: 0.3, rate: 0.8 },
  trump: { pitch: 0.7, rate: 0.95 },
  brucelee: { pitch: 1.5, rate: 0.7 },
  rajini: { pitch: 0.6, rate: 0.9 },
  srk: { pitch: 0.9, rate: 0.85 },
  lincoln: { pitch: 0.4, rate: 0.75 },
  shakespeare: { pitch: 0.6, rate: 0.7 },
  viking: { pitch: 0.2, rate: 0.9 },
  pirate: { pitch: 0.5, rate: 0.9 },
  ronaldo: { pitch: 1.2, rate: 0.55 },
  napoleon: { pitch: 1.8, rate: 1.3 },
  elvis: { pitch: 0.5, rate: 0.8 },
};

const HER = { pitch: 1.9, rate: 1.15 };

export function speak(line: string, who: EmberCostume | null = null): void {
  if (!emberPref("sound")) return;
  try {
    const synth = window.speechSynthesis;
    if (!synth) return;
    // One voice at a time: a new line cuts off the last, the way a person
    // interrupted by being thrown across a room would.
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(line);
    const voice = (who && VOICES[who]) || HER;
    utterance.pitch = voice.pitch;
    utterance.rate = voice.rate;
    utterance.volume = 0.8;
    synth.speak(utterance);
  } catch {
    // No speech on this machine: the bubble still says it.
  }
}
