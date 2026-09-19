import { mkdirSync, writeFileSync } from "node:fs";
import { join, posix } from "node:path";
import type { Db } from "../db/connection";
import { BRAIN_SECTION_LIST, templateOf, type BrainExport } from "@shared/brain";
import { parseLinks } from "@shared/links";
import { pagesOf } from "../repositories/brain";
import { describeValue } from "./brain";
import { safeName, stamp } from "./names";

/**
 * The whole brain as Markdown: a folder per section, a file per page, and an
 * index. Files anybody can open, search and keep, with no Caulder needed -
 * the same promise the CSV export makes for contacts and money.
 *
 * Registration and account numbers are masked unless the person exporting
 * asked for them in full; an export folder is exactly the thing that gets
 * handed to somebody.
 */

export function exportBrain(
  db: Db,
  companyId: string,
  companyName: string,
  parent: string,
  options: { secrets: boolean },
  now: Date = new Date(),
): BrainExport {
  const folder = join(parent, `${safeName(companyName)} brain ${stamp(now)}`);
  const files = writeBrain(db, companyId, companyName, folder, options, now);
  return { folder, files };
}

/** Writes the brain into a folder and returns how many files it wrote: none for an empty brain. */
export function writeBrain(
  db: Db,
  companyId: string,
  companyName: string,
  folder: string,
  options: { secrets: boolean },
  now: Date,
): number {
  const pages = pagesOf(db, companyId);
  if (pages.length === 0) return 0;
  mkdirSync(folder, { recursive: true });
  const used = new Set<string>();
  const index: string[] = [
    `# ${companyName}: the company brain`,
    "",
    `Exported ${now.toISOString().slice(0, 10)}.${
      options.secrets ? "" : " Registration and account numbers are masked."
    }`,
    "",
  ];

  // Every page's file first, so a link can point at a page written later.
  const paths = new Map<string, string>();
  const order: { section: string; pages: typeof pages }[] = [];
  BRAIN_SECTION_LIST.forEach((section, position) => {
    const mine = pages.filter((page) => page.section === section.id);
    if (mine.length === 0) return;
    const sectionFolder = `${String(position + 1).padStart(2, "0")} ${safeName(section.label)}`;
    for (const page of mine) {
      const directory = page.is_archived === 1 ? posix.join("Archived", sectionFolder) : sectionFolder;
      paths.set(page.id, unique(used, posix.join(directory, fileName(page.title))));
    }
    order.push({ section: section.label, pages: mine });
  });

  const contactNames = new Map(
    (db.prepare(`SELECT id, name FROM leads WHERE company_id = ?`).all(companyId) as { id: string; name: string }[]).map(
      (row) => [row.id, row.name],
    ),
  );
  const titles = new Map(pages.map((page) => [page.id, page.title]));

  let files = 0;
  for (const { section, pages: mine } of order) {
    index.push(`## ${section}`, "");
    for (const page of mine) {
      const name = paths.get(page.id) ?? fileName(page.title);
      mkdirSync(join(folder, posix.dirname(name)), { recursive: true });
      const body = linked(page.body, posix.dirname(name), { paths, titles, contactNames });
      writeFileSync(join(folder, name), pageMarkdown({ ...page, body }, options.secrets), "utf8");
      files += 1;
      index.push(`- [${page.title}](${href(name)})${page.is_archived === 1 ? " (archived)" : ""}`);
    }
    index.push("");
  }

  writeFileSync(join(folder, "README.md"), index.join("\n"), "utf8");
  return files + 1;
}

function href(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

/**
 * A page's links as a Markdown reader expects them: a relative link to the
 * other page's file, and a contact's name in bold - contacts are in the CSV,
 * not in this folder. A link to something deleted keeps its words.
 */
function linked(
  body: string,
  from: string,
  known: { paths: Map<string, string>; titles: Map<string, string>; contactNames: Map<string, string> },
): string {
  let out = "";
  let at = 0;
  for (const link of parseLinks(body)) {
    out += body.slice(at, link.start);
    if (link.kind === "page" && known.paths.has(link.id)) {
      const target = posix.relative(from, known.paths.get(link.id) ?? "");
      out += `[${known.titles.get(link.id) ?? link.label}](${href(target)})`;
    } else if (link.kind === "contact" && known.contactNames.has(link.id)) {
      out += `**${known.contactNames.get(link.id) ?? link.label}**`;
    } else {
      out += link.label;
    }
    at = link.end;
  }
  return out + body.slice(at);
}

function fileName(title: string): string {
  const base = safeName(title).replace(/\.+$/, "").slice(0, 80).trim() || "Untitled";
  return `${base}.md`;
}

/** Two pages called "Goal" become "Goal.md" and "Goal (2).md". */
function unique(used: Set<string>, name: string): string {
  let candidate = name;
  let n = 2;
  while (used.has(candidate.toLowerCase())) {
    candidate = name.replace(/\.md$/, ` (${n}).md`);
    n += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

function pageMarkdown(page: ReturnType<typeof pagesOf>[number], secrets: boolean): string {
  const template = templateOf(page.template);
  const lines = [`# ${page.title}`, "", `*${template.name} · updated ${page.updated_at.slice(0, 10)}*`, ""];

  const facts: string[] = [];
  for (const field of template.fields) {
    const value = describeValue(field.kind, page.stored[field.key], field.options, secrets);
    if (value !== null) facts.push(`- **${field.label}:** ${value.replace(/\n/g, ", ")}`);
  }
  if (facts.length > 0) lines.push(...facts, "");

  if (page.body.trim().length > 0) lines.push(page.body.trimEnd(), "");
  return lines.join("\n");
}
