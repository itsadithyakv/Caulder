import type { Db } from "../db/connection";
import { ENTRY_TEMPLATE, type BrainSectionId } from "@shared/brain";
import { memoriesOf, type Memory } from "@shared/memories";
import { textHash } from "@shared/understand";
import { shiftDay, today as todayIn } from "@shared/dates";
import { linkLabelsOnly } from "@shared/links";
import { isSealed } from "./journal-lock";
import { allMemories } from "./memories";
import { goalsOverview, hobbiesOverview, studiesOverview } from "./life";
import { listHabits } from "./habits";
import type { DossierDocument } from "./dossier";

/**
 * Your own side of Caulder, for a question you have allowed it to go with.
 *
 * The dossier is the company: contacts, deals, money, the brain's company
 * sections. This is the other half - the journal, the goals, the hobbies, the
 * courses, the habits, and the lines you asked to be remembered - and it is
 * off until you turn it on in Settings, because it is the half you would mind
 * a stranger reading.
 *
 * TWO THINGS NEVER LEAVE, whatever the setting says:
 *
 *  1. `journal_private`, the lines the line itself took as private - a crush,
 *     a row with your mother. They are a table of their own and nothing here
 *     reads it. Until a passcode exists those rows hold plain text, so
 *     "skip what is sealed" would not be enough; skipping the table is.
 *  2. A journal day that is sealed. Sealing empties the page, so there would
 *     be nothing to send anyway - but the page is checked as well, because a
 *     guard that depends on another function having emptied something is not
 *     a guard.
 *
 * The day's own readings - what a quiet day was, the pulse - stay out too:
 * the screen that collects them says they never leave this computer.
 */

/**
 * The sections whose pages go in this document. `remembered` is About me,
 * People, Where things are and Lent and borrowed: asked for on 25 September
 * 2026, so "what's my blood group" can be answered once you have said it may.
 * The journal is not here; it has rules of its own, in `journal()` below.
 * Not the same list as `PERSONAL_SECTIONS` in `shared/brain.ts`: `ideas` is
 * here because your memories are kept in it.
 */
const SENT_SECTIONS: readonly BrainSectionId[] = ["hobbies", "studies", "goals", "ideas", "remembered"];

/** How far back the journal is read. A season is enough to answer "how have I been". */
const JOURNAL_DAYS = 90;

/** The most entries sent, newest first, however long the season was. */
const MOST_ENTRIES = 30;

type PageRow = { id: string; title: string; section: BrainSectionId; body: string; fields: string };

const hours = (minutes: number): string =>
  minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60 > 0 ? `${minutes % 60}m` : ""}`.trim() : `${minutes}m`;

function dayOfEntry(fields: string): string | null {
  try {
    const parsed: unknown = JSON.parse(fields);
    const day = (parsed as Record<string, unknown> | null)?.["day"];
    return typeof day === "string" ? day : null;
  } catch {
    return null;
  }
}

/** The journal as it can be read: written days only, and only the ones nothing is hiding. */
function journal(db: Db, companyId: string, from: string): string[] {
  const rows = db
    .prepare(
      `SELECT id, title, section, body, fields FROM brain_pages
        WHERE company_id = ? AND template = ? AND is_archived = 0
        ORDER BY json_extract(fields, '$.day') DESC`,
    )
    .all(companyId, ENTRY_TEMPLATE) as PageRow[];

  const lines: string[] = [];
  let kept = 0;
  for (const row of rows) {
    if (kept >= MOST_ENTRIES) break;
    const day = dayOfEntry(row.fields);
    if (!day || day < from) continue;
    // Sealed: the words are ciphertext in journal_sealed and nowhere else.
    if (isSealed(db, row.id)) continue;
    const words = linkLabelsOnly(row.body).trim();
    if (words.length === 0) continue;
    lines.push(`### ${row.title}`, "", words, "");
    kept += 1;
  }
  return lines.length > 0 ? ["## The journal, most recent first", "", ...lines] : [];
}

function goals(db: Db, companyId: string, now: Date): string[] {
  const rows = goalsOverview(db, companyId, now).filter((goal) => !goal.done);
  if (rows.length === 0) return [];
  return [
    "## Goals",
    "",
    ...rows.map((goal) => {
      const where =
        goal.target !== null
          ? `${goal.progress ?? 0} of ${goal.target}${goal.unit ? ` ${goal.unit}` : ""}`
          : "no number to reach";
      const when = goal.byOn ? `, by ${goal.byOn} (${goal.daysLeft} days)` : "";
      return `- **${goal.title}**${goal.area ? ` (${goal.area})` : ""}: ${where}${when}`;
    }),
    "",
  ];
}

function hobbies(db: Db, companyId: string, now: Date): string[] {
  const rows = hobbiesOverview(db, companyId, now);
  if (rows.length === 0) return [];
  return [
    "## Hobbies",
    "",
    ...rows.map((hobby) => {
      const want = hobby.hoursWanted ? `, wanted ${hobby.hoursWanted}h` : "";
      const got = `${hours(Math.round(hobby.keptMinutes / 4))} a week over the last four`;
      return `- **${hobby.title}**${hobby.status ? ` (${hobby.status})` : ""}: ${got}${want}${
        hobby.goal ? ` - working towards ${hobby.goal}` : ""
      }`;
    }),
    "",
  ];
}

function studies(db: Db, companyId: string, now: Date): string[] {
  const overview = studiesOverview(db, companyId, now);
  if (overview.courses.length === 0 && overview.exams.length === 0) return [];
  const lines = ["## Studies", ""];
  if (overview.average !== null) lines.push(`Grade average so far: ${overview.average}.`, "");
  for (const course of overview.courses) {
    lines.push(
      `- **${course.title}**${course.code ? ` (${course.code})` : ""}${course.status ? ` - ${course.status}` : ""}${
        course.grade ? `, graded ${course.grade}` : ""
      }`,
    );
  }
  if (overview.exams.length > 0) {
    lines.push("", "Exams coming:", "");
    for (const exam of overview.exams.slice(0, 8)) {
      lines.push(`- ${exam.title} on ${exam.on} (${exam.daysLeft} days)`);
    }
  }
  lines.push("");
  return lines;
}

function habits(db: Db, companyId: string, now: Date): string[] {
  const { habits: rows } = listHabits(db, companyId, now);
  if (rows.length === 0) return [];
  return [
    "## Habits",
    "",
    ...rows.map(
      (habit) =>
        `- **${habit.name}**: ${habit.streak} in a row (best ${habit.best})${
          habit.rate !== null ? `, kept ${habit.rate}% of its days over four weeks` : ""
        }${habit.dueToday ? (habit.doneToday ? ", done today" : ", due today and not ticked") : ""}`,
    ),
    "",
  ];
}

/** Your own pages, and the dated lines on them you asked to be remembered. */
function pages(db: Db, companyId: string, first: readonly string[]): string[] {
  const rows = db
    .prepare(
      `SELECT id, title, section, body, fields FROM brain_pages
        WHERE company_id = ? AND is_archived = 0 AND section IN (${SENT_SECTIONS.map(() => "?").join(", ")})
        ORDER BY updated_at DESC`,
    )
    .all(companyId, ...SENT_SECTIONS) as PageRow[];

  // The memories nearest the question first, when the model on this machine
  // found any (phase 22), then the newest: sixty of them either way.
  const rank = new Map(first.map((ref, at) => [ref, at]));
  const place = (memory: Memory) => rank.get(`${memory.pageId}#${textHash(memory.raw)}`) ?? Number.POSITIVE_INFINITY;
  const remembered = rows
    .flatMap((row) => memoriesOf({ id: row.id, title: row.title, section: row.section, body: row.body }))
    .sort((a, b) => place(a) - place(b) || b.day.localeCompare(a.day))
    .slice(0, 60);

  const written = rows
    .filter((row) => linkLabelsOnly(row.body).trim().length > 0)
    .slice(0, 25)
    .flatMap((row) => [`### ${row.title}`, "", linkLabelsOnly(row.body).trim(), ""]);

  return [
    ...(remembered.length > 0
      ? [
          "## Things you asked to be remembered",
          "",
          ...remembered.map(
            (memory) => `- ${memory.fact ? `**${memory.fact}** - ` : ""}${memory.says} _(${memory.day}, ${memory.pageTitle})_`,
          ),
          "",
        ]
      : []),
    ...(written.length > 0 ? ["## Your own pages", "", ...written] : []),
  ];
}

/**
 * Everything of yours that may go with a question, as one document - or null
 * when there is nothing of yours written down yet.
 */
export function buildYours(
  db: Db,
  companyId: string,
  now: Date = new Date(),
  /** Memories to put first, as "pageId#hash": the ones nearest the question (phase 22). */
  first: readonly string[] = [],
): DossierDocument | null {
  const row = db.prepare(`SELECT timezone FROM companies WHERE id = ?`).get(companyId) as { timezone: string } | undefined;
  if (!row) return null;
  const today = todayIn(row.timezone, now);

  const parts = [
    ...goals(db, companyId, now),
    ...habits(db, companyId, now),
    ...hobbies(db, companyId, now),
    ...studies(db, companyId, now),
    ...pages(db, companyId, first),
    ...journal(db, companyId, shiftDay(today, -JOURNAL_DAYS)),
  ];
  if (parts.length === 0) return null;

  return {
    file: "you.md",
    title: "You",
    text: [
      "# You",
      "",
      "The founder's own side of Caulder, sent because they allowed it in Settings. Journal days that are locked, and anything they marked private, are not here and never are.",
      "",
      ...parts,
    ].join("\n"),
  };
}

/* ---- 04 you: an export of you, arranged (phase 22) -------------------------- */

/** A line of the export: what it is, what it says, when it was said. */
const factLine = (memory: Memory) => `- ${memory.fact ? `**${memory.fact}** - ` : ""}${memory.says} _(${memory.day})_`;

/**
 * *04 you*: what you told Caulder about yourself, written for an AI to read -
 * chosen, never sent (PLAN.md, part five, phase 22). Each fact once, the
 * current answer only, dated; laid out by what it is about - you, the people
 * you know, where things are, what you study, what you are working towards,
 * what you do for the love of it - with an index first, so a reader can find
 * its way. Journal days and private lines are never in it.
 *
 * `first`, as "pageId#hash", are the facts nearest what the export is for, when
 * it was said what it is for and the model could say which: they lead it.
 */
export function buildYouExport(db: Db, now: Date = new Date(), options: { purpose?: string; first?: readonly string[] } = {}): DossierDocument | null {
  const { companyId, memories, trails } = allMemories(db);
  if (!companyId) return null;
  const current = memories.filter((memory) => memory.current);
  const trailOf = (memory: Memory) => [...(trails[memory.pageId] ?? []), memory.pageTitle];
  const on = (title: string) => current.filter((memory) => memory.pageTitle === title);
  const people = current.filter((memory) => memory.section === "remembered" && trailOf(memory).includes("People"));
  const placed = new Set<Memory>();
  const take = (list: Memory[]) => {
    list.forEach((memory) => placed.add(memory));
    return list;
  };

  const sections: { title: string; lines: string[] }[] = [];
  const add = (title: string, lines: string[]) => {
    if (lines.length > 0) sections.push({ title, lines });
  };
  const byPage = (list: Memory[], heading: (memory: Memory) => string) => {
    const groups = new Map<string, Memory[]>();
    for (const memory of take(list)) groups.set(heading(memory), [...(groups.get(heading(memory)) ?? []), memory]);
    return [...groups.entries()].flatMap(([title, group]) => [`### ${title}`, "", ...group.map(factLine), ""]);
  };

  if (options.purpose && options.first && options.first.length > 0) {
    const rank = new Map(options.first.map((ref, at) => [ref, at]));
    const nearest = current
      .filter((memory) => rank.has(`${memory.pageId}#${textHash(memory.raw)}`))
      .sort((a, b) => (rank.get(`${a.pageId}#${textHash(a.raw)}`) ?? 0) - (rank.get(`${b.pageId}#${textHash(b.raw)}`) ?? 0))
      .slice(0, 15);
    add(`What matters most for: ${options.purpose}`, [...nearest.map((memory) => `${factLine(memory)} - ${memory.pageTitle}`), ""]);
  }
  add("About me", [...take(on("About me")).map(factLine), ""]);
  add("People", byPage(people, (memory) => memory.pageTitle));
  add("Where things are, and what was lent", [...take([...on("Where things are"), ...on("Lent and borrowed")]).map(factLine), ""]);
  add("Studies", [...studies(db, companyId, now), ...byPage(current.filter((memory) => memory.section === "studies"), (memory) => trailOf(memory).join(" › "))]);
  add("Goals and habits", [...goals(db, companyId, now), ...habits(db, companyId, now), ...byPage(current.filter((memory) => memory.section === "goals" && !placed.has(memory)), (memory) => memory.pageTitle)]);
  add("Interests", byPage(current.filter((memory) => memory.section === "hobbies"), (memory) => trailOf(memory).join(" › ")));
  add("Ideas and things learnt", byPage(current.filter((memory) => !placed.has(memory) && memory.section === "ideas"), (memory) => memory.pageTitle));
  add("Everything else remembered", byPage(current.filter((memory) => !placed.has(memory)), (memory) => memory.pageTitle));
  if (sections.length === 0) return null;

  return {
    file: "04 you.md",
    title: "You",
    text: [
      "# You",
      "",
      "What I have told my app about myself, each thing once and as it is now, with the day I said it. Written for an assistant to read; nothing from my journal or anything I marked private is in it.",
      "",
      "## In here",
      "",
      ...sections.map((section) => `- ${section.title}`),
      "",
      ...sections.flatMap((section) => [`## ${section.title}`, "", ...section.lines]),
    ].join("\n"),
  };
}
