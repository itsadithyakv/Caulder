import type { BrainSectionId } from "./brain";
import { seriesOf } from "./books";

/**
 * Where a thing hangs in your own brain: the whole way down to it.
 *
 *   Me > Hobbies > Reading > Sci-fi > Red Rising series > Red Rising
 *
 * The three words people mix up, as this file means them. The **brain** is
 * the pages. A **memory** is a dated line the quick line writes on one. The
 * **map** is the shape the pages make - and the shape is nothing but "Part
 * of" links, one from each page to the one above it. So branching well is
 * only ever a matter of working out that chain, and of every page on it
 * existing: this file works it out, and services/remember.ts makes it so.
 *
 * Every level is a real page rather than a dot the map invents, so each can
 * be opened, written on, renamed and linked like any other - "Me" included.
 *
 * What it reads is what the line said, never a guess past it: a genre is a
 * prong only when the line names one, a series when it names one or the book
 * is of a series Caulder knows. A line that says less makes a shorter chain,
 * and a later line that says more does not move the page - the page says where
 * it hangs, in words its owner can change.
 */

export type Step = {
  title: string;
  section: BrainSectionId;
  /** A hobby's own page is a hobby, so Life counts its hours; everything else is a plain page. */
  template: "page" | "hobby";
};

/** What the window hands main to keep: the line, the page it is about, and the chain above that page. */
export type RememberInput = {
  pageId: string | null;
  topic: string | null;
  section: BrainSectionId;
  trail: Step[];
  said: string;
  fact: string | null;
  day: string;
};

/** What was kept, and which pages had to be started to keep it there. */
export type Remembered = { pageId: string; title: string; trail: string[]; started: string[] };

/** What a thing is, in the terms the prongs are chosen by. */
export type Is = "book" | "film" | "song" | "game" | "recipe" | "exercise" | "course" | "thing";

export const ROOT: Step = { title: "Me", section: "goals", template: "page" };

const HUBS: Partial<Record<BrainSectionId, Step>> = {
  hobbies: { title: "Hobbies", section: "hobbies", template: "page" },
  studies: { title: "Studies", section: "studies", template: "page" },
};

/** Said about a book or a film, and worth a level of its own when it is. */
const GENRES: readonly [RegExp, string][] = [
  [/\b(?:sci[\s-]?fi|science[\s-]fiction)\b/i, "Sci-fi"],
  [/\b(?:non[\s-]?fiction)\b/i, "Non-fiction"],
  [/\bfantasy\b/i, "Fantasy"],
  [/\bthrillers?\b/i, "Thriller"],
  [/\b(?:mystery|mysteries|whodunn?it)\b/i, "Mystery"],
  [/\b(?:romance|rom[\s-]?com)\b/i, "Romance"],
  [/\bhorror\b/i, "Horror"],
  [/\b(?:biograph(?:y|ies)|memoirs?|autobiograph(?:y|ies))\b/i, "Biography"],
  [/\bself[\s-]?help\b/i, "Self-help"],
  [/\bdystopian?\b/i, "Dystopian"],
  [/\bphilosophy\b/i, "Philosophy"],
  [/\bpoetry\b/i, "Poetry"],
  [/\bclassics?\b/i, "Classic"],
  [/\bcrime\b/i, "Crime"],
  [/\bdocumentar(?:y|ies)\b/i, "Documentary"],
  [/\bcomed(?:y|ies)\b/i, "Comedy"],
  [/\banime\b/i, "Anime"],
];

/** "...of the red rising series", "in the mistborn trilogy": the series, named. */
const SERIES_SAID = /\b(?:of|in|from)\s+the\s+((?:[\p{L}\p{N}'’&.-]+\s+){0,4}?[\p{L}\p{N}'’&.-]+)\s+(?:series|trilogy|saga|franchise|universe|cycle)\b/iu;

/** "riptide by vance joy": who a song is by, up to where the line starts saying something else. */
const BY = /\bby\s+((?:[\p{L}\p{N}'’&.-]+\s+){0,3}?[\p{L}\p{N}'’&.-]+)(?=\s*(?:$|[,.;!?]|\s(?:is|was|are|has|on|and|the|its|it|i|which|that)\b))/iu;

/** Which part of the body a lift is for, so the gym branches the way a programme does. */
const BODY: readonly [RegExp, string][] = [
  [/\b(?:bench|push[\s-]?ups?|chest|fl(?:y|ies)|dips?)\b/i, "Chest"],
  [/\b(?:rows?|pull[\s-]?ups?|chin[\s-]?ups?|lat\b|pulldowns?|deadlifts?)\b/i, "Back"],
  [/\b(?:squats?|lunges?|leg|calf|calves|hamstrings?|quads?|hip\s+thrusts?)\b/i, "Legs"],
  [/\b(?:overhead|shoulder|lateral|military|delts?)\b/i, "Shoulders"],
  [/\b(?:curls?|triceps?|biceps?|skull\s*crushers?)\b/i, "Arms"],
  [/\b(?:planks?|crunch(?:es)?|sit[\s-]?ups?|abs|core)\b/i, "Core"],
];

function titled(text: string): string {
  return text.trim().replace(/(^|[\s-])(\p{Ll})/gu, (_whole, gap: string, letter: string) => gap + letter.toUpperCase());
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The levels between a hobby and the thing itself, outermost first. Only what the line gives grounds for. */
export function prongsOf(is: Is, text: string, topic: string): string[] {
  const prongs: string[] = [];
  if (is === "book" || is === "film") {
    const genre = GENRES.find(([says]) => says.test(text))?.[1];
    // A genre is its hobby's: levels are found by their title, and one "Sci-fi"
    // page would have a film hanging off Reading. "Sci-fi books" also says what is in it.
    if (genre) prongs.push(`${genre} ${is === "book" ? "books" : "films"}`);
  }
  if (is === "book" || is === "film" || is === "game") {
    const said = SERIES_SAID.exec(text)?.[1];
    const series = said ? titled(said) : is === "book" ? seriesOf(topic) : null;
    if (series) prongs.push(`${series} series`);
  }
  if (is === "song") {
    const artist = BY.exec(text)?.[1];
    if (artist) prongs.push(titled(artist));
  }
  if (is === "exercise") {
    const part = BODY.find(([says]) => says.test(topic))?.[1];
    if (part) prongs.push(part);
  }
  // A thing is never part of itself: "the red rising series" said of the series' own page.
  return prongs.filter((prong) => !same(prong, topic));
}

/**
 * The whole chain above a thing: Me, the hub of its section, the hobby it is
 * part of, and its prongs. `trunk` is the hobby - the page the brain already
 * has for it when there is one, or the name to start one under.
 */
export function trailOf(input: { section: BrainSectionId; trunk: Step | null; is: Is; text: string; topic: string }): Step[] {
  const hub = HUBS[input.section];
  const steps: Step[] = [ROOT, ...(hub ? [hub] : []), ...(input.trunk ? [input.trunk] : [])];
  for (const prong of prongsOf(input.is, input.text, input.topic)) {
    steps.push({ title: prong, section: input.section, template: "page" });
  }
  // Nothing twice, and never the thing itself: a line about Reading is not part of Reading.
  return steps.filter((step, at) => !same(step.title, input.topic) && steps.findIndex((each) => same(each.title, step.title)) === at);
}

/** "Hobbies › Reading › Red Rising series": the chain as it is said, without the root everybody shares. */
export function sayTrail(trail: readonly { title: string }[]): string {
  return trail
    .filter((step) => !same(step.title, ROOT.title))
    .map((step) => step.title)
    .join(" › ");
}
