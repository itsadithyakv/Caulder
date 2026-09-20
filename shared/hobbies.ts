/**
 * A page for a hobby, designed for what the hobby is.
 *
 * A gym wants its best lifts and the scale; running wants how far and how
 * fast; a guitar wants its songs; reading wants its shelf. One screen that
 * showed every hobby the same four numbers would be right for none of them,
 * so each kind has its own - and anything this does not know gets the plain
 * one, which is still hours, days and whatever was counted under its name.
 *
 * Built from what is already kept: the numbers the quick line logged
 * (hobby_logs), the hours on the Calendar, and the pages in the brain that
 * hang off the hobby's own - the memories, which is what ties this to the
 * brain. Nothing is entered here. It is a way of looking.
 */

export type HobbyKind = "gym" | "running" | "cycling" | "swimming" | "music" | "drawing" | "reading" | "language" | "outdoors" | "generic";

const KINDS: readonly [HobbyKind, RegExp][] = [
  ["gym", /\b(?:gym|weights?|lifting|strength|workout|fitness|calisthenics|crossfit|bodybuilding)\b/i],
  ["running", /\b(?:run|running|jogging|marathon|sprints?)\b/i],
  ["cycling", /\b(?:cycling|cycle|biking|bike|mtb)\b/i],
  ["swimming", /\b(?:swim|swimming)\b/i],
  ["music", /\b(?:guitar|keyboard|piano|ukulele|violin|drums?|bass|flute|sitar|tabla|veena|singing|vocals|music)\b/i],
  ["drawing", /\b(?:drawing|sketching|sketch|painting|art|illustration|calligraphy|doodling|watercolou?r)\b/i],
  ["reading", /\b(?:reading|books?|literature)\b/i],
  ["language", /\b(?:language|languages|spanish|french|german|italian|portuguese|japanese|korean|mandarin|chinese|hindi|tamil|telugu|kannada|malayalam|arabic|russian|dutch|sanskrit)\b/i],
  ["outdoors", /\b(?:hiking|hike|trekking|trek|bird\s?watching|birding|camping|climbing|outdoors?)\b/i],
];

export function kindOfHobby(title: string): HobbyKind {
  return KINDS.find(([, words]) => words.test(title))?.[0] ?? "generic";
}

/** What to say to the line for this kind of hobby, shown while its page is still empty. */
const HOBBY_HINT: Record<HobbyKind, string> = {
  gym: "“hit a pr, 45kg on the bench press for 3 reps” · “did 20 push ups” · “weighed in at 72 kg”",
  running: "“went for a run, 5 km at a 4.30 pace”",
  cycling: "“cycled 22 km this morning”",
  swimming: "“swam 1.5 km”",
  music: "“learnt a new song called riptide, the chords are tricky” · “guitar 40 min”",
  drawing: "“sketching 30 min” · “tried charcoal for the first time, loved it”",
  reading: "“i am reading dune” · “read 30 pages” · “i want to read the percy jackson series”",
  language: "“learnt 15 new words in spanish” · “did my spanish lesson”",
  outdoors: "“hiked 8 km up to the fort” · “spotted a kingfisher by the lake”",
  generic: "“<the hobby> 40 min” · anything you tell the line about it is kept on its page",
};

export type LogRow = { day: string; topic: string; metric: string; value: number; unit: string; reps: number | null; best: boolean };

export type BoardTile = { label: string; value: string };
/** One thing tracked over time, with the points to draw: a lift, the scale, how far. */
export type BoardTrack = { topic: string; says: string; points: { day: string; value: number }[]; lowerIsBetter: boolean };

export type HobbyBoard = {
  id: string;
  title: string;
  kind: HobbyKind;
  tiles: BoardTile[];
  tracks: BoardTrack[];
  /** Pages in the brain that hang off this hobby: its songs, its lifts, its books. */
  pages: { id: string; title: string }[];
  hint: string;
};

const LANGUAGES = KINDS.find(([kind]) => kind === "language")?.[1] ?? /$^/;
const DISTANCE_OF: Partial<Record<HobbyKind, string[]>> = {
  running: ["Running"], cycling: ["Cycling"], swimming: ["Swimming"], outdoors: ["Hiking"],
};

/** Which of what was logged belongs to a hobby: by what kind it is, and always anything logged under its own name. */
function logsFor(kind: HobbyKind, title: string, logs: readonly LogRow[]): LogRow[] {
  const own = title.trim().toLowerCase();
  return logs.filter((row) => {
    const topic = row.topic.toLowerCase();
    if (topic === own) return true;
    if (kind === "gym") return row.metric === "weight" || row.metric === "reps" || row.topic === "Body Weight";
    if (kind === "reading") return row.metric === "pages";
    if (kind === "language") return row.unit === "words" && (own === "languages" || own === "language" ? LANGUAGES.test(row.topic) : false);
    if (kind === "outdoors") return row.topic === "Hiking" || row.topic === "Bird Watching";
    return (DISTANCE_OF[kind] ?? []).includes(row.topic);
  });
}

const round = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(1));
const pace = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, "0")}`;
const hours = (minutes: number) => (minutes < 60 ? `${minutes} min` : `${round(Math.round((minutes / 60) * 10) / 10)} h`);

/**
 * The board for one hobby. `minutes` is the hours it got on the Calendar, a
 * day at a time; `shelf` is only given to reading.
 */
export function buildBoard(
  hobby: { id: string; title: string },
  logs: readonly LogRow[],
  minutes: ReadonlyMap<string, number>,
  pages: { id: string; title: string }[],
  monthStart: string,
  shelf?: { reading: number; toRead: number; read: number },
): HobbyBoard {
  const kind = kindOfHobby(hobby.title);
  const mine = logsFor(kind, hobby.title, logs);
  const tiles: BoardTile[] = [];

  const total = [...minutes.values()].reduce((sum, each) => sum + each, 0);
  const month = [...minutes.entries()].filter(([day]) => day >= monthStart).reduce((sum, [, each]) => sum + each, 0);
  const days = new Set([...[...minutes.entries()].filter(([, each]) => each > 0).map(([day]) => day), ...mine.map((row) => row.day)]).size;
  if (total > 0) tiles.push({ label: "This month", value: hours(month) }, { label: "This year", value: hours(total) });
  if (days > 0) tiles.push({ label: "Days", value: String(days) });

  const of = (metric: string, topic?: string) => mine.filter((row) => row.metric === metric && (topic === undefined || row.topic === topic));
  const tracks: BoardTrack[] = [];

  // Anything done over a distance: how far in all, the longest, the fastest - and the line of it.
  for (const topic of new Set(of("distance").map((row) => row.topic))) {
    const far = of("distance", topic);
    const unit = far[0]?.unit ?? "km";
    const sum = far.reduce((all, row) => all + row.value, 0);
    tiles.push({ label: kind === "outdoors" ? `${topic}` : "Distance", value: `${round(sum)} ${unit}` }, { label: "Longest", value: `${round(Math.max(...far.map((row) => row.value)))} ${unit}` });
    tracks.push({ topic: `${topic}: distance`, says: `${far.length} ${far.length === 1 ? "outing" : "outings"}, ${round(sum)} ${unit} in all`, points: far.map((row) => ({ day: row.day, value: row.value })), lowerIsBetter: false });
    const paces = of("pace", topic);
    if (paces.length > 0) {
      const fastest = Math.min(...paces.map((row) => row.value));
      tiles.push({ label: "Fastest", value: `${pace(fastest)} /${unit}` });
      tracks.push({ topic: `${topic}: pace`, says: `fastest ${pace(fastest)} /${unit}`, points: paces.map((row) => ({ day: row.day, value: row.value })), lowerIsBetter: true });
    }
  }

  // Each lift, by its best: the wall of a gym.
  const lifts = new Map<string, LogRow[]>();
  for (const row of of("weight")) lifts.set(row.topic, [...(lifts.get(row.topic) ?? []), row]);
  for (const [topic, rows] of [...lifts.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const best = rows.reduce((top, row) => (row.value > top.value ? row : top), rows[0] as LogRow);
    const first = rows[0] as LogRow;
    tracks.push({
      topic,
      says: `best ${round(best.value)} ${best.unit}${best.reps ? ` × ${best.reps}` : ""}${best.value > first.value ? `, up from ${round(first.value)}` : ""}`,
      points: rows.map((row) => ({ day: row.day, value: row.value })),
      lowerIsBetter: false,
    });
  }
  if (lifts.size > 0) tiles.push({ label: "Lifts tracked", value: String(lifts.size) }, { label: "Bests called", value: String(of("weight").filter((row) => row.best).length) });

  const counted = new Map<string, LogRow[]>();
  for (const row of of("reps")) counted.set(row.topic, [...(counted.get(row.topic) ?? []), row]);
  for (const [topic, rows] of counted) {
    const sum = rows.reduce((all, row) => all + row.value, 0);
    tracks.push({ topic, says: `${sum.toLocaleString("en")} in all, the most in one go ${Math.max(...rows.map((row) => row.value))}`, points: rows.map((row) => ({ day: row.day, value: row.value })), lowerIsBetter: false });
  }

  const scale = of("bodyweight");
  if (scale.length > 0) {
    const last = scale[scale.length - 1] as LogRow;
    const moved = last.value - (scale[0] as LogRow).value;
    tiles.push({ label: "Body weight", value: `${round(last.value)} ${last.unit}` });
    tracks.push({ topic: "Body weight", says: scale.length > 1 ? `${moved === 0 ? "level" : `${moved > 0 ? "up" : "down"} ${round(Math.abs(moved))} ${last.unit}`} since the first weigh-in` : "one weigh-in so far", points: scale.map((row) => ({ day: row.day, value: row.value })), lowerIsBetter: false });
  } else if (of("change").length > 0) {
    const moved = of("change").reduce((all, row) => all + row.value, 0);
    tiles.push({ label: "Body weight", value: `${moved > 0 ? "+" : "−"}${round(Math.abs(moved))} ${of("change")[0]?.unit ?? "kg"}` });
  }

  const words = of("count").filter((row) => row.unit === "words");
  if (words.length > 0) tiles.push({ label: "Words learnt", value: words.reduce((all, row) => all + row.value, 0).toLocaleString("en") });
  const seen = of("count").filter((row) => row.unit === "sightings");
  if (seen.length > 0) tiles.push({ label: "Birds spotted", value: String(seen.length) });
  const read = of("pages");
  if (read.length > 0) tiles.push({ label: "Pages", value: read.reduce((all, row) => all + row.value, 0).toLocaleString("en") });

  if (kind === "reading" && shelf) {
    tiles.push({ label: "Reading", value: String(shelf.reading) }, { label: "To be read", value: String(shelf.toRead) }, { label: "Read", value: String(shelf.read) });
  }
  if (kind === "music" && pages.length > 0) tiles.push({ label: "Songs and pieces", value: String(pages.length) });

  return { id: hobby.id, title: hobby.title, kind, tiles, tracks, pages, hint: HOBBY_HINT[kind] };
}
