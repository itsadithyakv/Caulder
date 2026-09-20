/**
 * What a line is about, when it never says so outright.
 *
 * "Red rising is a book" names its subject and says what it is; most of what
 * people say about what they do does neither. "I hit a pr today, 45kg on the
 * bench press for 3 reps" is about the bench press. "I learnt a new song
 * called riptide, the chords are difficult" is about Riptide. Found, each gets
 * a page of its own in the brain, so that everything said about the bench
 * press is in one place and reads as a history of it.
 *
 * Two ways of finding it, and both narrow on purpose - a page started for the
 * wrong thing is clutter that has to be found and deleted:
 *
 *  - **A thing called something**: "a song called riptide", "a book named
 *    dune". The word before says what kind of thing it is.
 *  - **An exercise**, from a list. What is done in a gym has a few dozen names
 *    and people use them, so they are matched rather than guessed at.
 *
 * And, for a lift, the numbers: "PR: 45 kg × 3" leads the entry, so the page
 * can be read down its left edge.
 */

export type Subject = {
  /** The page it belongs on, as its title: "Bench Press", "Riptide". */
  topic: string;
  /** What kind of thing, for where the page goes and what it hangs off. */
  kind: "exercise" | "song" | "book" | "film" | "game" | "recipe" | "course" | "thing";
  /** The part worth reading first: "PR: 45 kg × 3". Null when it is all in the words. */
  fact: string | null;
};

/** Longest first where one contains another, so "incline bench press" is not read as the bench press. */
const EXERCISES: readonly string[] = [
  "incline bench press", "decline bench press", "dumbbell bench press", "bench press", "overhead press",
  "shoulder press", "military press", "arnold press", "leg press", "chest press", "push press",
  "romanian deadlift", "sumo deadlift", "stiff leg deadlift", "deadlift", "front squat", "goblet squat",
  "bulgarian split squat", "split squat", "hack squat", "back squat", "squat", "hip thrust", "glute bridge",
  "walking lunge", "lunge", "leg extension", "leg curl", "hamstring curl", "calf raise",
  "lateral raise", "front raise", "rear delt fly", "reverse fly", "chest fly", "cable fly", "pec deck",
  "face pull", "upright row", "barbell row", "dumbbell row", "cable row", "seated row", "bent over row",
  "t-bar row", "lat pulldown", "pull up", "pullup", "chin up", "chinup", "muscle up", "push up", "pushup",
  "tricep pushdown", "tricep extension", "skull crusher", "close grip bench", "bicep curl", "hammer curl",
  "preacher curl", "barbell curl", "dumbbell curl", "concentration curl", "cable curl", "shrug",
  "farmers walk", "farmer's walk", "kettlebell swing", "clean and jerk", "power clean", "snatch", "thruster",
  "burpee", "plank", "side plank", "crunch", "sit up", "situp", "leg raise", "hanging leg raise",
  "russian twist", "mountain climber", "box jump", "dip",
];

/** How each is written on a page. The plural where that is how it is said: nobody does one lateral raise. */
const SAID_PLURAL = new Set([
  "lateral raise", "front raise", "calf raise", "leg raise", "hanging leg raise", "pull up", "pullup", "chin up",
  "chinup", "push up", "pushup", "muscle up", "sit up", "situp", "dip", "lunge", "walking lunge", "squat",
  "crunch", "burpee", "shrug", "bicep curl", "hammer curl", "face pull", "skull crusher", "mountain climber",
  "box jump", "russian twist", "kettlebell swing", "thruster",
]);

const escape = (word: string) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** "Pull up", "pull-up", "pullups": a space is a space, a hyphen or nothing, and any of them may be plural. */
const EXERCISE = new RegExp(
  `\\b(${[...EXERCISES]
    .sort((a, b) => b.length - a.length)
    .map((name) => escape(name).replace(/ /g, "[\\s-]?"))
    .join("|")})(?:e?s)?\\b`,
  "i",
);

const KINDS: Record<string, Subject["kind"]> = {
  song: "song", track: "song", tune: "song", piece: "song", riff: "song", solo: "song",
  book: "book", novel: "book", audiobook: "book", manga: "book", comic: "book",
  movie: "film", film: "film", show: "film", series: "film", anime: "film", documentary: "film", podcast: "film",
  game: "game", recipe: "recipe", dish: "recipe", course: "course", subject: "course",
};

/**
 * "A song called riptide", "a book named dune", "the film titled heat". The
 * name runs to the first thing that ends a name: a comma, a "by", the end.
 */
const CALLED = new RegExp(
  String.raw`\b(${Object.keys(KINDS).join("|")})\s+(?:called|named|titled|known\s+as)\s+["“'‘]?(.+?)["”'’]?(?=\s*(?:$|[,.;:!?()]|\s(?:by|from|on|and|but|which|that|it|its|it's|the\s+(?:chords?|lyrics|ending|plot|story))\b))`,
  "i",
);

/** "Learnt riptide on guitar", "played wonderwall on the piano": the piece, by the instrument it was played on. */
const PLAYED = /\b(?:learnt|learned|learning|played|practi[sc]ed|nailed|mastered|memori[sz]ed)\s+(?:to\s+play\s+)?["“'‘]?(.+?)["”'’]?\s+on\s+(?:the\s+|my\s+)?(?:guitar|piano|keyboard|ukulele|uke|violin|bass|drums|flute|sitar|tabla|veena)\b/i;

const SMALL = new Set(["a", "an", "the", "of", "and", "in", "on", "to", "for", "by", "with", "at", "from"]);

/** "bench press" is Bench Press; a capital somebody chose - "AC/DC" - is kept. */
function titled(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((word, index) =>
      word !== word.toLowerCase() || (index > 0 && SMALL.has(word)) ? word : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(" ");
}

const WEIGHT = /(\d+(?:\.\d+)?)\s*(kgs?|kilos?|kilograms?|lbs?|pounds?|plates?)\b/i;
const SETS_BY_REPS = /\b(\d{1,2})\s*(?:x|×|\*|sets?\s+of)\s*(\d{1,3})\b/i;
const REPS = /\b(\d{1,3})\s*(?:reps?|repetitions?|times)\b|\bfor\s+(\d{1,3})\b(?!\s*(?:min|mins|minutes?|hours?|hrs?|h\b|sets?|days?|weeks?|kg|kgs|lbs?))/i;
const PR = /\b(?:pr|pb|personal\s+(?:best|record)|new\s+(?:max|best|record)|1\s?rm|one\s+rep\s+max)\b/i;

/** "20 push ups", "did 50 squats": a number, then the exercise. Built once the list of them is. */
const COUNT_BEFORE = new RegExp(String.raw`\b(\d{1,4})\s+(?:reps?\s+of\s+)?(?=${EXERCISE.source.replace(/^\\b/, "")})`, "i");

/** "PR: 45 kg × 3", "3 × 10 at 20 kg", "45 kg": the numbers of a lift, the way they are written on a gym wall. */
function liftFact(text: string): string | null {
  const weight = WEIGHT.exec(text);
  const scheme = SETS_BY_REPS.exec(text);
  const reps = REPS.exec(text);
  const unit = weight ? (/^(?:lb|pound)/i.test(weight[2] ?? "") ? "lb" : /^plate/i.test(weight[2] ?? "") ? "plates" : "kg") : "";
  const load = weight ? `${weight[1]} ${unit}` : null;
  // "Did 20 push ups": the count said straight before what was counted.
  const before = COUNT_BEFORE.exec(text);
  const count = scheme ? `${scheme[1]} × ${scheme[2]}` : reps ? `× ${reps[1] ?? reps[2]}` : before ? `× ${before[1]}` : null;
  const numbers = scheme && load ? `${count} at ${load}` : [load, count].filter(Boolean).join(" ");
  if (!numbers) return PR.test(text) ? "PR" : null;
  return `${PR.test(text) ? "PR: " : ""}${numbers}`;
}

const DISTANCE = /(\d+(?:\.\d+)?)\s*(kms?|kilomet(?:er|re)s?|k|mi|miles?)\b/i;
/** "A 4.30 pace", "4:30/km", "5 min per km": said with the word, because "4.30" alone is a time. */
const PACE = /(\d{1,2})[.:](\d{2})\s*(?:min(?:ute)?s?\s*)?(?:pace|\/\s?km|\/\s?mi|per\s+(?:km|mile|k))|\bpace\s+(?:of\s+|was\s+|at\s+)?(\d{1,2})[.:](\d{2})/i;
const RAN = /\b(?:ran|run|runs|running|jog|jogged|jogging|sprints?|sprinted|went\s+for\s+a\s+(?:run|jog))\b/i;
/** Kept off "run the numbers" and "running late": a run is one with a distance, a pace, or gone for. */
const A_RUN = /\bwent\s+for\s+a\s+(?:run|jog)\b|\b(?:morning|evening|long|easy|tempo|recovery)\s+run\b/i;

/** "5 km · 4:30 /km": how far and how fast. */
function runFact(text: string): string | null {
  const far = DISTANCE.exec(text);
  const pace = PACE.exec(text);
  const unit = far ? (/^mi/i.test(far[2] ?? "") ? "mi" : "km") : "km";
  const parts = [far ? `${far[1]} ${unit}` : null, pace ? `${pace[1] ?? pace[3]}:${pace[2] ?? pace[4]} /${unit}` : null];
  return parts.filter(Boolean).join(" · ") || null;
}

/** What else is done over a distance. `did` is the doing of it; `went` is going for one, which needs no number. */
const MOVED: readonly { topic: string; did: RegExp; went: RegExp }[] = [
  { topic: "Cycling", did: /\b(?:cycled|cycling|cycle|biked|biking|rode|ride|bike\s+ride)\b/i, went: /\bwent\s+(?:for\s+a\s+)?(?:cycling|ride|bike\s+ride|cycle)\b/i },
  { topic: "Hiking", did: /\b(?:hiked|hiking|hike|trekked|trekking|trek)\b/i, went: /\bwent\s+(?:for\s+a\s+|on\s+a\s+)?(?:hik(?:e|ing)|trek(?:king)?)\b/i },
  { topic: "Swimming", did: /\b(?:swam|swimming|swim|laps)\b/i, went: /\bwent\s+(?:for\s+a\s+)?swim(?:ming)?\b/i },
];

const LANGUAGE =
  /\b(?:spanish|french|german|italian|portuguese|japanese|korean|mandarin|chinese|hindi|tamil|telugu|kannada|malayalam|marathi|bengali|gujarati|punjabi|urdu|arabic|russian|dutch|swedish|turkish|greek|latin|sanskrit)\b/i;
const WORDS = /\b(?:learnt|learned|memori[sz]ed|picked\s+up)\s+(\d{1,4})\s+(?:new\s+)?(?:words?|phrases?|kanji|characters?)\b/i;
const STUDIED = /\b(?:learnt|learned|learning|studied|studying|practi[sc]ed|practi[sc]ing|lesson|class|duolingo|revised)\b/i;
/** "Spotted a kingfisher by the lake": what was seen, up to where the sentence moves on. */
const SPOTTED = /\b(?:spotted|saw|sighted)\s+(?:an?\s+|two\s+|three\s+|some\s+|\d+\s+)?((?:[\p{L}-]+\s+){0,2}(?:kingfishers?|eagles?|owls?|herons?|egrets?|parakeets?|parrots?|kites?|hornbills?|woodpeckers?|bulbuls?|sunbirds?|robins?|sparrows?|mynas?|peacocks?|peafowl|flamingos?|storks?|cormorants?|ducks?|geese|hawks?|falcons?|vultures?|drongos?|bee-eaters?|barbets?|swallows?|warblers?|finch(?:es)?|cranes?|pelicans?|ibis|koels?|cuckoos?|orioles?|flycatchers?|birds?))\b/iu;

const MASS = String.raw`(\d+(?:\.\d+)?)\s*(kgs?|kilos?|kilograms?|lbs?|pounds?)\b`;
const LOST = new RegExp(String.raw`\b(?:lost|dropped|shed|cut|(?:am|i'm|im)\s+down|down)\s+(?:about\s+|around\s+)?${MASS}`, "i");
const GAINED = new RegExp(String.raw`\b(?:gained|put\s+on|added|(?:am|i'm|im)\s+up|bulked\s+(?:up\s+)?)\s+(?:about\s+|around\s+)?${MASS}`, "i");
const WEIGH = new RegExp(String.raw`\b(?:weigh(?:ed|ing|s)?(?:\s+in)?|body\s*weight|bodyweight|bw|on\s+the\s+scale)\s+(?:is\s+|was\s+|at\s+|now\s+|of\s+)*${MASS}`, "i");

/** "−5 kg", "+2 kg", "72 kg": what the scale said, or what changed. */
function weightFact(text: string): string | null {
  const unitOf = (raw: string | undefined) => (/^(?:lb|pound)/i.test(raw ?? "") ? "lb" : "kg");
  const lost = LOST.exec(text);
  if (lost) return `−${lost[1]} ${unitOf(lost[2])}`;
  const gained = GAINED.exec(text);
  if (gained) return `+${gained[1]} ${unitOf(gained[2])}`;
  const weigh = WEIGH.exec(text);
  return weigh ? `${weigh[1]} ${unitOf(weigh[2])}` : null;
}

/** What a line is about, or null when it does not say - which is most lines, and is fine. */
export function subjectOf(text: string): Subject | null {
  const called = CALLED.exec(text);
  if (called?.[2]) {
    const name = called[2].trim();
    // A name is a few words. "A book called the one my sister will not stop talking about" is not one.
    if (name.length >= 2 && name.split(/\s+/).length <= 6) {
      return { topic: titled(name), kind: KINDS[(called[1] ?? "").toLowerCase()] ?? "thing", fact: null };
    }
  }

  const played = PLAYED.exec(text);
  if (played?.[1] && played[1].split(/\s+/).length <= 6 && !/^(?:a|an|the|some|my)\b/i.test(played[1])) {
    return { topic: titled(played[1]), kind: "song", fact: null };
  }

  const exercise = EXERCISE.exec(text);
  if (exercise?.[1]) {
    // Back to the way the list spells it, whatever was typed: "pull-ups" and "pullup" are one page.
    const typed = exercise[1].toLowerCase().replace(/[\s-]+/g, " ");
    const listed = EXERCISES.find((name) => name === typed || name.replace(/ /g, "") === typed.replace(/ /g, "")) ?? typed;
    const name = SAID_PLURAL.has(listed) ? `${listed}${/(?:ch|sh|s|x)$/.test(listed) ? "es" : "s"}` : listed;
    return { topic: titled(name), kind: "exercise", fact: liftFact(text) };
  }

  // A run: gone for, or said with how far or how fast. Its numbers lead, as a lift's do.
  if (RAN.test(text) && (A_RUN.test(text) || DISTANCE.test(text) || PACE.test(text))) {
    return { topic: "Running", kind: "exercise", fact: runFact(text) };
  }
  // The same for anything else done over a distance: a ride, a hike, a swim.
  for (const moved of MOVED) {
    if (moved.did.test(text) && (moved.went.test(text) || DISTANCE.test(text))) {
      return { topic: moved.topic, kind: "exercise", fact: runFact(text) };
    }
  }

  const words = WORDS.exec(text);
  if (words) {
    const language = LANGUAGE.exec(text)?.[0];
    return { topic: language ? titled(language.toLowerCase()) : "Languages", kind: "course", fact: `${words[1]} new words` };
  }
  if (LANGUAGE.test(text) && STUDIED.test(text)) {
    return { topic: titled((LANGUAGE.exec(text)?.[0] ?? "").toLowerCase()), kind: "course", fact: null };
  }

  const bird = SPOTTED.exec(text);
  if (bird?.[1]) return { topic: "Bird Watching", kind: "thing", fact: `Spotted: ${bird[1].trim()}` };

  // The scale. After the lifts, because "up 2 kg on the bench" is the bench.
  const weight = weightFact(text);
  if (weight) return { topic: "Body Weight", kind: "exercise", fact: weight };
  return null;
}


/* ---- The numbers, as numbers --------------------------------------------- */

/**
 * One thing measured: what is counted up at the end of a year, and drawn as a
 * line in between. The fact at the front of a memory is the same numbers for
 * reading; this is them for adding up.
 */
export type Measure = {
  /** What it is a measure of, as its page is titled: "Push Ups", "Running", "Body Weight". */
  topic: string;
  metric: "reps" | "weight" | "distance" | "pace" | "bodyweight" | "change" | "pages" | "count";
  value: number;
  unit: string;
  /** For a weight lifted: how many times. */
  reps: number | null;
  /** Said to be the best yet. */
  best: boolean;
};

const DISTANCE_TOPICS = new Set(["Running", "Cycling", "Hiking", "Swimming"]);
const PAGES = /\b(?:read|reading|finished)\s+(?:about\s+|around\s+)?(\d{1,4})\s+pages?\b/i;

/** Everything a line measures. Most measure nothing, and that is an empty list. */
export function measuresOf(text: string): Measure[] {
  const pages = PAGES.exec(text);
  if (pages) return [{ topic: "Reading", metric: "pages", value: Number(pages[1]), unit: "pages", reps: null, best: false }];

  const subject = subjectOf(text);
  if (!subject) return [];
  // Words learnt and birds seen are counted too: one unit each, and the unit says of what.
  const learnt = WORDS.exec(text);
  if (learnt) return [{ topic: subject.topic, metric: "count", value: Number(learnt[1]), unit: "words", reps: null, best: false }];
  if (subject.topic === "Bird Watching") return [{ topic: "Bird Watching", metric: "count", value: 1, unit: "sightings", reps: null, best: false }];
  if (subject.kind !== "exercise") return [];
  const best = PR.test(text);
  const out: Measure[] = [];

  if (DISTANCE_TOPICS.has(subject.topic)) {
    const far = DISTANCE.exec(text);
    const pace = PACE.exec(text);
    const miles = far ? /^mi/i.test(far[2] ?? "") : false;
    if (far) out.push({ topic: subject.topic, metric: "distance", value: Number(far[1]), unit: miles ? "mi" : "km", reps: null, best });
    if (pace) {
      const seconds = Number(pace[1] ?? pace[3]) * 60 + Number(pace[2] ?? pace[4]);
      out.push({ topic: subject.topic, metric: "pace", value: seconds, unit: miles ? "s/mi" : "s/km", reps: null, best });
    }
    return out;
  }

  if (subject.topic === "Body Weight") {
    const lost = LOST.exec(text);
    const gained = GAINED.exec(text);
    const weigh = WEIGH.exec(text);
    const unitOf = (raw: string | undefined) => (/^(?:lb|pound)/i.test(raw ?? "") ? "lb" : "kg");
    if (lost) out.push({ topic: "Body Weight", metric: "change", value: -Number(lost[1]), unit: unitOf(lost[2]), reps: null, best: false });
    else if (gained) out.push({ topic: "Body Weight", metric: "change", value: Number(gained[1]), unit: unitOf(gained[2]), reps: null, best: false });
    else if (weigh) out.push({ topic: "Body Weight", metric: "bodyweight", value: Number(weigh[1]), unit: unitOf(weigh[2]), reps: null, best: false });
    return out;
  }

  const weight = WEIGHT.exec(text);
  const scheme = SETS_BY_REPS.exec(text);
  const said = REPS.exec(text);
  const before = COUNT_BEFORE.exec(text);
  const reps = scheme ? Number(scheme[1]) * Number(scheme[2]) : said ? Number(said[1] ?? said[2]) : before ? Number(before[1]) : null;
  if (weight && !/^plate/i.test(weight[2] ?? "")) {
    out.push({ topic: subject.topic, metric: "weight", value: Number(weight[1]), unit: /^(?:lb|pound)/i.test(weight[2] ?? "") ? "lb" : "kg", reps, best });
  } else if (reps !== null) {
    out.push({ topic: subject.topic, metric: "reps", value: reps, unit: "reps", reps: null, best });
  }
  return out;
}
