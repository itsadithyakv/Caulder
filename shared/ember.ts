/**
 * Ember: the little flame that sits on the quick line, and what colour it burns.
 *
 * The line does four different things depending on what it is set to, and
 * they are not small differences - one files a task in the company, one
 * writes in your journal, one asks an AI, one puts your own notes on the
 * clipboard for somebody else's. Getting that wrong is not a slip, it is
 * typing a private thought into a box that copies it out.
 *
 * So the mode is said by colour, and said by the one thing already on that
 * line: the mark. **A flame test.** Copper burns green, potassium violet, a
 * gas ring blue, and plain fire orange. The app is called Caulder and its
 * mark is a cauldron over a flame, so the chemistry was already there to be
 * borrowed. You learn four colours once and never read the control again.
 *
 * Colour is never the only signal - each button keeps its own title and its
 * pressed state, and the placeholder in the line changes with it - but it is
 * the one that works at a glance, which is the only speed this control is
 * ever used at.
 */

export type LineMode = "work" | "life" | "ask" | "copy";

export type EmberMood =
  /** Nothing happening: she bobs and flickers. */
  | "resting"
  /** Waiting on something: the AI, or a brief being gathered. */
  | "thinking"
  /** It worked. A single bounce, then back to resting. */
  | "pleased"
  /** It did not work. */
  | "sorry"
  /** Late, and nothing has happened for a while. */
  | "asleep"
  /** The pointer has sat beside her long enough that she has noticed it. */
  | "friendly";

type LineModeInfo = {
  id: LineMode;
  /** On the button, and read out. */
  title: string;
  /** What the line will do, said in the line itself. */
  placeholder: string;
  /** Why the flame is that colour, for the tooltip. */
  detail: string;
};

const LINE_MODES: readonly LineModeInfo[] = [
  {
    id: "work",
    title: "Into the company",
    placeholder: "Say anything - a task, what you did, how it went, something to remember",
    detail: "Orange, plain fire: Caulder reads the line itself and files it in this company.",
  },
  {
    id: "life",
    title: "Into your own day",
    placeholder: "Say anything - what you did, how it went, something to remember",
    detail: "Blue, a gas flame: Caulder reads the line itself and files it in your own day.",
  },
  {
    id: "ask",
    title: "Ask the AI",
    placeholder: "Ask anything - about today, the company, or you",
    detail: "Green, copper burning: the line is a question for the AI Caulder is connected to.",
  },
  {
    id: "copy",
    title: "Copy context for another AI",
    placeholder: "A topic - everything Caulder knows about it goes on the clipboard",
    detail: "Violet, potassium burning: what Caulder knows leaves for an AI that is not Caulder's.",
  },
];

export function lineMode(saved: unknown): LineMode {
  return LINE_MODES.some((mode) => mode.id === saved) ? (saved as LineMode) : "work";
}

export function modeInfo(id: LineMode): LineModeInfo {
  return LINE_MODES.find((mode) => mode.id === id) ?? (LINE_MODES[0] as LineModeInfo);
}

/**
 * Which of the two writing modes a workspace is in. A personal workspace has
 * no funnel to file anything into, so its line is always the blue one - the
 * mode is a fact about the workspace, not a choice, and offering it as a
 * choice would be a control that does nothing in one of the two workspaces.
 */
export function writingMode(personal: boolean): LineMode {
  return personal ? "life" : "work";
}

/** What Ember is feeling, from what the line is doing. */
type EmberState = {
  /** Something is in flight: the AI is reading, or a brief is being gathered. */
  busy: boolean;
  /** The last thing tried came back as an error. */
  failed: boolean;
  /** The last thing tried worked, within the last few seconds. */
  justDid: boolean;
  /** The pointer has been sitting beside her long enough to count. */
  noticed: boolean;
  /** The hour where the person is, 0 to 23. */
  hour: number;
};

/** How close the pointer has to be, in pixels from her middle, to be beside her. */
export const NOTICE_NEAR = 70;

/** And how long it has to stay there. Long enough to be deliberate, short enough to feel answered. */
export const NOTICE_MS = 900;

/**
 * The small hours, when she would rather be asleep.
 *
 * Deliberately 1am rather than 11pm. This app is for somebody who works at
 * night on purpose, and a mascot yawning at them at half past ten reads as
 * an opinion about their evening.
 */
const LATE_FROM = 1;
const LATE_UNTIL = 6;

/**
 * What Ember does, given what just happened and what time it is.
 *
 * The one place the rule lives, so the three surfaces wearing a flame - the
 * quick line, the AI line and the card in the brain - cannot drift into
 * three different mascots.
 */
export function moodOf(state: EmberState): EmberMood {
  // Something in flight always wins: it is the only mood that is a fact
  // rather than a judgement, and it is the one the person is waiting on.
  if (state.busy) return "thinking";

  // Then what just happened, which is also a fact. Sorry before pleased: if
  // the last thing failed, that is the news.
  if (state.failed) return "sorry";
  if (state.justDid) return "pleased";

  // Then the pointer. Before sleep on purpose - somebody hovering over her
  // at two in the morning has plainly come to say hello, and a mascot that
  // kept snoring through it would be a worse toy than no mascot.
  if (state.noticed) return "friendly";

  return state.hour >= LATE_FROM && state.hour < LATE_UNTIL ? "asleep" : "resting";
}

/**
 * What she is doing with herself when nobody is asking anything of her.
 *
 * The point of a mascot that has a life is that you catch her at it. So it
 * is mostly nothing - she rests far more than she does anything - and the
 * pastimes come round on their own, slowly, the way you would glance up and
 * find the cat has moved.
 */
export type EmberDoing =
  | "none"
  | "reading"
  | "running"
  | "warming"
  | "stretching"
  /** Shredding an electric guitar, eyes shut. */
  | "guitar"
  /** Dancing under a disco ball. */
  | "disco"
  | "skating"
  /** Headphones on, bobbing along. */
  | "music"
  /** A mug of something, held in both hands. */
  | "tea"
  /** In bed under a raincloud. She has days too. */
  | "moping"
  /** Dressed up as somebody: see shared/wardrobe.ts for who. */
  | "cosplay"
  /** Swinging a pixel pickaxe at a block until it gives. */
  | "mining"
  /** Sat under a blocky tree, dozing, while a leaf comes down. */
  | "tree";

/** How long one stretch of doing something lasts. Slow on purpose: cosy, not busy. */
export const DOING_MS = 24_000;

/**
 * The order she gets round to them in. Loud things and quiet things
 * alternate, so she never goes from the guitar straight to the disco and a
 * glance up finds something different in kind, not just in prop. Dressing up
 * comes round twice in fourteen, because the wardrobe is the biggest thing
 * she has; moping once, because she has days, but not many.
 */
const PASTIMES: readonly EmberDoing[] = [
  "reading",
  "guitar",
  "tea",
  "cosplay",
  "warming",
  "disco",
  "stretching",
  "running",
  "music",
  "cosplay",
  "moping",
  "skating",
  "tree",
  "mining",
];

/**
 * How many times she has dressed up before the `tick`th stretch: which
 * costume comes out next. Counted over the pastimes rather than taken from
 * the tick, because the two dressing-up slots sit six apart in a cycle of
 * twelve, and a tick-based pick would only ever reach every other costume.
 */
export function dressedBefore(tick: number): number {
  if (!Number.isFinite(tick) || tick < 0) return 0;
  const slot = Math.floor(Math.floor(tick) / 4);
  const perCycle = PASTIMES.filter((one) => one === "cosplay").length;
  const within = PASTIMES.slice(0, slot % PASTIMES.length).filter((one) => one === "cosplay").length;
  return Math.floor(slot / PASTIMES.length) * perCycle + within;
}

/**
 * What she is up to in the `tick`th stretch of time since the app opened.
 *
 * Counted rather than random, for three reasons. Every flame on the screen
 * is the same person and must be doing the same thing at the same moment; a
 * random draw can repeat and reads as broken; and a pure function of a
 * number is a thing a test can state the whole behaviour of.
 *
 * Three stretches of resting to one of doing something, so she is mostly
 * just a flame and catching her reading is a small event rather than the
 * normal state of the screen.
 */
export function doingAt(tick: number): EmberDoing {
  if (!Number.isFinite(tick) || tick < 0) return "none";
  const at = Math.floor(tick);
  if (at % 4 !== 3) return "none";
  return PASTIMES[Math.floor(at / 4) % PASTIMES.length] ?? "none";
}

/** Something she is wearing. */
type EmberHat = "none" | "glasses" | "nightcap" | "cap";

type HatWhen = {
  mood: EmberMood;
  doing: EmberDoing;
};

/**
 * What Ember has on.
 *
 * Deterministic, never random: a mascot whose hat changes on every render is
 * a flicker, and one whose hat changes for no reason is a distraction.
 *
 * **The wardrobe follows what she is doing, never what day it is.** This
 * function used to take the month and the weekday, and that was the mistake
 * rather than a missing branch. A hat you can explain by looking at her - a
 * nightcap because she is asleep, glasses because she is reading, a cap
 * because she is running - says something, and says it the hundredth time as
 * clearly as the first. A hat that arrives because it is Saturday, or
 * December, cannot explain itself: you see it, you cannot tell why, and the
 * honest reading is that something has broken. Both of those were also wrong
 * on their own terms here - Saturday is a working day for somebody building
 * a company, and Bengaluru does not have a woolly-hat month.
 *
 * So there are three, each tied to an occasion she is visibly in, and the
 * rest of the time she is just a flame. Mood outranks pastime, because a
 * pastime only happens while she is resting anyway.
 */
export function hatOf(when: HatWhen): EmberHat {
  // Asleep, so a nightcap. Reading, so glasses - she wears them while she is
  // working through your notes, and takes them off when she is done.
  if (when.mood === "asleep") return "nightcap";
  if (when.mood === "thinking") return "glasses";

  // Out for a run or on a board, so a cap. The two pastimes that would
  // plainly want one.
  if (when.doing === "running" || when.doing === "skating") return "cap";

  return "none";
}

/* ---- Tricks ----------------------------------------------------------------
 *
 * A pastime is a long stretch of doing something; a trick is two or three
 * seconds of doing something funny. Tricks are what make her feel alive
 * between the pastimes - a trip on the way along the bar, a somersault, a
 * wave - and what she does when something happens to her: a poke, a task
 * finished, the last overdue thing cleared.
 * ------------------------------------------------------------------------- */

export type EmberTrick =
  /** Both arms up and a hop, with confetti: a task done. */
  | "cheer"
  /** Poked in the belly. */
  | "giggle"
  /** Poked on the head: she squashes, sees stars, and pops back up. */
  | "bonk"
  /** Down on her face, stars, and back up dusting herself off. */
  | "trip"
  /** Poked too many times in a row. */
  | "dizzy"
  /** A somersault, drawn in quarter turns so no pixel lands off the grid. */
  | "flip"
  | "wave"
  /** A puff of smoke, out of which she steps in costume. */
  | "poof"
  /** A marshmallow, toasted on her own flame and eaten. What calms her down. */
  | "munch"
  /** One of the dances: see `DANCES`. */
  | "dance"
  /** A wand, a flourish and a word: one of her ways back up. */
  | "magic"
  /** Ta-da, and a bow: arriving somewhere as if she meant to all along. */
  | "bow"
  /** A marshmallow caught and gone in one: what a habit ticked looks like to her. */
  | "gulp"
  /** A shake of the head: something she does not know yet. */
  | "nope"
  /** Whatever the costume she has on does: the moonwalk, the jab, the bolt. */
  | "signature";

/** Where on her she was poked, from how far down her the click landed. */
export type Poke = "head" | "belly" | "feet";

/** Pokes closer together than this are one streak. */
export const STREAK_MS = 1500;

/** And this many in one streak and her head is spinning. */
const DIZZY_AFTER = 5;

/**
 * Which part of her a click landed on, from where it landed as a share of her
 * height: 0 is the top of her box and 1 the bottom. The top third is her head
 * and the flame over it, the bottom sixth her legs, and everything between is
 * belly - the biggest target, because it is the one most people aim for.
 */
export function pokeAt(fromTop: number): Poke {
  if (!Number.isFinite(fromTop)) return "belly";
  if (fromTop < 0.36) return "head";
  if (fromTop > 0.8) return "feet";
  return "belly";
}

/**
 * What a poke makes her do.
 *
 * Talking Tom's rule, which is why his was fun and most mascots are not: a
 * different place gets a different answer, so poking is exploring rather than
 * repeating. Feet trip her, the head bonks her, the belly tickles - unless
 * she is in costume, when the belly is where the costume's own move lives.
 * Keep going and she gets dizzy, which is the answer to a person clicking
 * forty times to see what happens.
 */
export function pokeTrick(where: Poke, streak: number, costumed: boolean): EmberTrick {
  if (streak >= DIZZY_AFTER) return "dizzy";
  if (where === "head") return "bonk";
  if (where === "feet") return "trip";
  return costumed ? "signature" : "giggle";
}

/**
 * The tricks she does of her own accord, in order. Counted like the
 * pastimes, and for the same reasons: every flame on the screen is the same
 * person, and a trip that happened twice in a row would look like a bug.
 * The trip comes round twice as often as anything else, because it is the
 * funniest thing she does.
 */
const OWN_TRICKS: readonly EmberTrick[] = ["trip", "dance", "wave", "dance", "trip", "flip", "dance"];

/**
 * Whether she does something funny at the start of the `tick`th stretch.
 * One stretch in four, and never one with a pastime in it: the second of the
 * three quiet stretches, so a trick and a pastime are never back to back.
 */
export function trickAt(tick: number): EmberTrick | null {
  if (!Number.isFinite(tick) || tick < 0) return null;
  const at = Math.floor(tick);
  if (at % 4 !== 1) return null;
  return OWN_TRICKS[Math.floor(at / 4) % OWN_TRICKS.length] ?? null;
}

/** Things that happen in the app that she has an answer to. */
export type EmberCue = "done" | "cleared";

/**
 * Her answer to something you did. A task ticked off gets a dance - a
 * different one each time; the last overdue thing cleared gets the whole
 * routine, in costume - the biggest thing she does for the biggest small win
 * there is on Today.
 */
export function cueTrick(cue: EmberCue): EmberTrick {
  return cue === "cleared" ? "signature" : "dance";
}

/**
 * Every dance she knows, in the order she gets round to them. Mixed so two
 * in a row are never the same kind - a floss is never followed by a Carlton,
 * which is nearly the same move.
 */
export const DANCES = [
  "dab",
  "robot",
  "floss",
  "sixseven",
  "headspin",
  "disco",
  "moonwalk",
  "chicken",
  "griddy",
  "worm",
  "carlton",
  "macarena",
  "sprinkler",
  "gangnam",
  "jacks",
  "jig",
  "twist",
  "runningman",
  "cossack",
  "ninjarun",
] as const;

export type EmberDance = (typeof DANCES)[number];

/** What each dance is called, for the menu that asks her for one. */
export const DANCE_NAMES: Record<EmberDance, string> = {
  dab: "The dab",
  robot: "The robot",
  floss: "The floss",
  sixseven: "6-7",
  headspin: "Headspin",
  disco: "Disco point",
  moonwalk: "The moonwalk",
  chicken: "Chicken dance",
  griddy: "The griddy",
  worm: "The worm",
  carlton: "The Carlton",
  macarena: "Macarena",
  sprinkler: "The sprinkler",
  gangnam: "Horse dance",
  jacks: "Jumping jacks",
  jig: "Irish jig",
  twist: "The twist",
  runningman: "Running man",
  cossack: "Cossack kicks",
  ninjarun: "The ninja run",
};

/** The `n`th dance, going round the list. */
export function danceAt(n: number): EmberDance {
  const at = Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
  return DANCES[at % DANCES.length] as EmberDance;
}

/** The four faces she has. Everything else is done with what is round her face. */
type EmberFace = "open" | "shut" | "glad" | "sad";

/**
 * Her face, from her mood and what she is up to.
 *
 * Mood first, for the same reason as the hat: a pastime only runs while she
 * is resting, so a mood that is anything else has already stopped it. Then
 * the pastime, because what she is doing is what she would be feeling -
 * eyes shut on the guitar because that is how anybody plays a solo, happy
 * arcs for the disco and the headphones and the tea, and a frown in bed.
 */
export function faceOf(when: { mood: EmberMood; doing: EmberDoing }): EmberFace {
  if (when.mood === "asleep") return "shut";
  if (when.mood === "friendly") return "glad";
  if (when.mood === "sorry") return "sad";
  if (when.mood !== "resting") return "open";

  switch (when.doing) {
    case "moping":
      return "sad";
    case "guitar":
    case "tree":
      return "shut";
    case "disco":
    case "music":
    case "tea":
    case "cosplay":
      return "glad";
    default:
      return "open";
  }
}

/* ---- Her temper -------------------------------------------------------------
 *
 * She puts up with a lot, and then she does not. Every poke, throw and bump
 * adds to it and it cools on its own; past one line she is cross, past the
 * next she goes up in flames and takes the screen with her until somebody
 * gives her a marshmallow.
 *
 * A number that cools with time rather than a count of recent things, so
 * there is no list to keep and no window to slide: one value and the moment
 * it was last touched is the whole state.
 * ------------------------------------------------------------------------- */

export type Temper = { heat: number; at: number };

/** What gets under her skin, and how much. */
export type Bother = "poke" | "chuck" | "bump" | "drop";

const BOTHER: Record<Bother, number> = { poke: 1, chuck: 2, bump: 1, drop: 1 };

/** One unit of heat goes every this many milliseconds. */
const COOLS_MS = 4000;

/** Cross from here: a red face and steam. */
export const CROSS_AT = 5;

/** And up in flames from here. */
export const BURNS_AT = 9;

export function cooled(temper: Temper, now: number): number {
  const gone = Math.max(0, now - temper.at) / COOLS_MS;
  return Math.max(0, temper.heat - gone);
}

export function bother(temper: Temper, what: Bother, now: number): Temper {
  return { heat: cooled(temper, now) + BOTHER[what], at: now };
}
