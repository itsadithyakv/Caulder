import type { Db } from "../db/connection";
import { ENTRY_TEMPLATE, type BrainSectionId } from "@shared/brain";
import { memoriesOf } from "@shared/memories";
import { shiftDay, today as todayIn } from "@shared/dates";
import { linkLabelsOnly } from "@shared/links";
import { isSealed } from "./journal-lock";
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
function pages(db: Db, companyId: string): string[] {
  const rows = db
    .prepare(
      `SELECT id, title, section, body, fields FROM brain_pages
        WHERE company_id = ? AND is_archived = 0 AND section IN (${SENT_SECTIONS.map(() => "?").join(", ")})
        ORDER BY updated_at DESC`,
    )
    .all(companyId, ...SENT_SECTIONS) as PageRow[];

  const remembered = rows
    .flatMap((row) => memoriesOf({ id: row.id, title: row.title, section: row.section, body: row.body }))
    .sort((a, b) => b.day.localeCompare(a.day))
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
export function buildYours(db: Db, companyId: string, now: Date = new Date()): DossierDocument | null {
  const row = db.prepare(`SELECT timezone FROM companies WHERE id = ?`).get(companyId) as { timezone: string } | undefined;
  if (!row) return null;
  const today = todayIn(row.timezone, now);

  const parts = [
    ...goals(db, companyId, now),
    ...habits(db, companyId, now),
    ...hobbies(db, companyId, now),
    ...studies(db, companyId, now),
    ...pages(db, companyId),
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
