import { existsSync, readFileSync } from "node:fs";
import { basename, extname, join, posix } from "node:path";
import type { Db } from "../db/connection";
import { BRAIN_SECTION_LIST, isPersonalSection, isSection, templateOf, type BrainSectionId } from "@shared/brain";
import {
  DOCUMENT_CATEGORIES,
  DOCUMENT_CATEGORY_LABEL,
  describeRule,
  type DocumentCategory,
} from "@shared/deadlines";
import {
  HANDBOOK_EXTRAS,
  ROOM_EXTRA_LABEL,
  handbookInput,
  roomInput,
  type RoomChoices,
  type RoomExtra,
} from "@shared/dataroom";
import { PERSON_KIND_LABEL } from "@shared/people";
import { PRODUCT_STATUS_LABEL, describeRecurrence } from "@shared/products";
import { today as todayIn } from "@shared/dates";
import { pagesOf, type StoredFields } from "../repositories/brain";
import { readMe } from "../repositories/me";
import { describeValue } from "./brain";
import { buildPeople } from "./people";
import { buildCatalogue } from "./products";
import { buildMetrics } from "./metrics";
import { buildDeadlines } from "./deadlines";
import { money } from "./invoice-html";
import { documentHtml, escapeHtml, factsHtml, markdownHtml, tableHtml, type LinkResolver } from "./page-html";
import { safeName } from "./names";
import { ZipWriter } from "./zip";

/**
 * The data room and the company handbook (PLAN.md, phase 13).
 *
 * Both are built from what the founder ticked: sections of the brain, kinds
 * of document, and the tables that are not pages - people, products,
 * metrics, filings. Everything here is read and written as text first, so
 * the tests can read what an investor would; the zip and the printer only
 * package it.
 *
 * The founder's own sections - studies, hobbies, the journal - are never
 * offered: this is the company, handed to somebody else.
 */

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "18 September 2026": a document handed to somebody spells its dates out. */
function spellDay(day: string): string {
  const [year, month, date] = day.split("-").map(Number) as [number, number, number];
  return `${date} ${MONTHS[month - 1]} ${year}`;
}

type Company = { id: string; name: string; currency: string; timezone: string; logo: string | null };

type Page = ReturnType<typeof pagesOf>[number];

function companyOf(db: Db, companyId: string): Company {
  const row = db.prepare(`SELECT id, name, currency, timezone, logo FROM companies WHERE id = ?`).get(companyId) as
    | Company
    | undefined;
  if (!row) throw new Error("That company no longer exists.");
  return row;
}

/** The name the company goes by: the profile's trading or legal name, else the workspace's. */
function displayName(db: Db, company: Company): { name: string; oneLiner: string | null } {
  const profile = pagesOf(db, company.id, "profile")[0]?.stored ?? {};
  const text = (key: string) => {
    const value = profile[key];
    return typeof value === "string" && value.trim() ? value.trim() : null;
  };
  return { name: text("tradingName") ?? text("legalName") ?? company.name, oneLiner: text("oneLiner") };
}

/** The sections a data room or a handbook can hold: the company's, not the founder's own. */
function offeredSections(): { id: BrainSectionId; label: string }[] {
  return BRAIN_SECTION_LIST.filter((section) => !isPersonalSection(section.id)).map(({ id, label }) => ({ id, label }));
}

type DocumentRow = {
  id: string;
  name: string;
  category: DocumentCategory;
  file: string | null;
  location: string | null;
  expires_on: string | null;
  notes: string | null;
  created_at: string;
};

function documentsOf(db: Db, companyId: string): DocumentRow[] {
  return db
    .prepare(
      `SELECT id, name, category, file, location, expires_on, notes, created_at FROM documents
        WHERE company_id = ? ORDER BY category, name COLLATE NOCASE`,
    )
    .all(companyId) as DocumentRow[];
}

export function roomChoices(db: Db, companyId: string, now: Date = new Date()): RoomChoices {
  const company = companyOf(db, companyId);
  const pages = db
    .prepare(`SELECT section, COUNT(*) AS n FROM brain_pages WHERE company_id = ? AND is_archived = 0 GROUP BY section`)
    .all(companyId) as { section: string; n: number }[];
  const count = (section: string) => pages.find((row) => row.section === section)?.n ?? 0;
  const documents = documentsOf(db, companyId);
  const rows = (sql: string) => (db.prepare(sql).get(companyId) as { n: number }).n;
  const today = todayIn(company.timezone, now);

  return {
    company: displayName(db, company).name,
    sections: offeredSections().map((section) => ({ ...section, pages: count(section.id) })),
    categories: DOCUMENT_CATEGORIES.map((category) => ({
      id: category,
      label: DOCUMENT_CATEGORY_LABEL[category],
      files: documents.filter((row) => row.category === category && row.file).length,
      written: documents.filter((row) => row.category === category && !row.file).length,
    })),
    extras: {
      people: rows(`SELECT COUNT(*) AS n FROM people WHERE company_id = ? AND kind != 'candidate'`),
      products: rows(`SELECT COUNT(*) AS n FROM products WHERE company_id = ?`),
      metrics: rows(`SELECT COUNT(*) AS n FROM metrics WHERE company_id = ?`),
      filings: (db.prepare(`SELECT COUNT(*) AS n FROM obligations WHERE company_id = ? AND is_active = 1 AND (ends_on IS NULL OR ends_on >= ?)`).get(companyId, today) as { n: number }).n,
    },
  };
}

/* ---- Pages ---------------------------------------------------------------- */

type Chosen = { section: { id: BrainSectionId; label: string }; pages: Page[] }[];

/** The live pages of the ticked sections, in the rail's order. Unknown and personal sections are ignored. */
function chosenPages(db: Db, companyId: string, sections: readonly string[]): Chosen {
  const wanted = new Set(sections.filter((id) => isSection(id) && !isPersonalSection(id)));
  const pages = pagesOf(db, companyId).filter((page) => page.is_archived === 0 && wanted.has(page.section));
  return offeredSections()
    .filter((section) => wanted.has(section.id))
    .map((section) => ({ section, pages: pages.filter((page) => page.section === section.id) }))
    .filter((entry) => entry.pages.length > 0);
}

/** A page's fields as words, in the template's order: dates spelled, money in the currency, secrets masked unless asked. */
function factsOf(page: { template: string; stored: StoredFields }, currency: string, secrets: boolean) {
  const facts: { label: string; value: string }[] = [];
  for (const field of templateOf(page.template).fields) {
    const raw = page.stored[field.key];
    const value = describeValue(field.kind, raw, field.options, secrets);
    if (value === null) continue;
    if (field.kind === "date" && typeof raw === "string") facts.push({ label: field.label, value: spellDay(raw) });
    else if (field.kind === "money" && typeof raw === "number") facts.push({ label: field.label, value: money(raw, currency) });
    else facts.push({ label: field.label, value });
  }
  return facts;
}

function pageBody(page: Page, currency: string, secrets: boolean, resolve: LinkResolver, heading: string): string {
  const template = templateOf(page.template);
  return [
    heading,
    `<p class="meta">${escapeHtml(template.name)} · updated ${escapeHtml(spellDay(page.updated_at.slice(0, 10)))}${
      page.updated_by ? ` by ${escapeHtml(page.updated_by)}` : ""
    }</p>`,
    factsHtml(factsOf(page, currency, secrets)),
    page.body.trim() ? markdownHtml(page.body, resolve) : "",
  ].join("\n");
}

/** Contacts, people and products are named in bold: they are not pages in this document. */
function namesOf(db: Db, companyId: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const row of db.prepare(`SELECT id, name FROM leads WHERE company_id = ?`).all(companyId) as { id: string; name: string }[]) {
    out.set(`contact:${row.id}`, row.name);
  }
  for (const row of db.prepare(`SELECT id, title AS name FROM brain_pages WHERE company_id = ?`).all(companyId) as {
    id: string;
    name: string;
  }[]) {
    out.set(`page:${row.id}`, row.name);
  }
  return out;
}

/* ---- The tables that are not pages ---------------------------------------- */

function extrasHtml(db: Db, company: Company, extras: ReadonlySet<RoomExtra>, forHandbook: boolean, now: Date): { id: RoomExtra; title: string; html: string }[] {
  const out: { id: RoomExtra; title: string; html: string }[] = [];
  const day = (value: string | null) => (value ? spellDay(value) : "");

  if (extras.has("people")) {
    const people = buildPeople(db, company.id, now).people.filter((person) => person.kind !== "candidate");
    if (people.length > 0) {
      // A handbook is read by the team: who does what, never what anybody holds.
      const head = forHandbook ? ["Name", "Role", "Kind", "Since", "Looks after"] : ["Name", "Role", "Kind", "Since", "Equity", "Looks after"];
      const rows = people.map((person) => {
        const base = [person.name, person.role ?? "", PERSON_KIND_LABEL[person.kind], day(person.startsOn)];
        const vested = person.vesting ? Math.round(person.vesting.vested * 100) / 100 : null;
        const equity =
          person.equity !== null
            ? `${person.equity}%${vested !== null && vested < person.equity ? `, ${vested}% vested` : ""}`
            : "";
        return forHandbook ? [...base, person.owns ?? ""] : [...base, equity, person.owns ?? ""];
      });
      out.push({ id: "people", title: forHandbook ? "Who is who" : ROOM_EXTRA_LABEL.people, html: tableHtml(head, rows) });
    }
  }

  if (extras.has("products")) {
    const catalogue = buildCatalogue(db, company.id, now);
    if (catalogue.products.length > 0) {
      const head = forHandbook ? ["Product", "One is", "Price now"] : ["Product", "Status", "One is", "Price now", "Brought in"];
      const rows = catalogue.products.map((product) => {
        const price = product.current
          ? `${money(product.current.amount, company.currency)} ${describeRecurrence(product.current.recurrence)}`
          : "";
        return forHandbook
          ? [product.name, product.unit ?? "", price]
          : [
              product.name,
              PRODUCT_STATUS_LABEL[product.status],
              product.unit ?? "",
              price,
              product.sales.invoices > 0
                ? `${money(product.sales.value, company.currency)} on ${product.sales.invoices} ${product.sales.invoices === 1 ? "invoice" : "invoices"}`
                : "",
            ];
      });
      out.push({ id: "products", title: forHandbook ? "What we sell" : ROOM_EXTRA_LABEL.products, html: tableHtml(head, rows) });
    }
  }

  if (!forHandbook && extras.has("metrics")) {
    const overview = buildMetrics(db, company.id, now);
    if (overview.metrics.length > 0) {
      const months = overview.metrics[0]?.history.slice(-6).map((point) => point.month) ?? [];
      const label = (month: string) => spellDay(`${month}-01`).replace(/^1 /, "");
      const show = (kind: string, value: number | null, unit: string | null) => {
        if (value === null) return "";
        if (kind === "money") return money(value, company.currency);
        if (kind === "percent") return `${value}%`;
        return `${value.toLocaleString("en-GB")}${unit ? ` ${unit}` : ""}`;
      };
      const rows = overview.metrics.map((metric) => [
        metric.name,
        ...months.map((month) => show(metric.kind, metric.history.find((point) => point.month === month)?.value ?? null, metric.unitLabel)),
        metric.target !== null ? show(metric.kind, metric.target, metric.unitLabel) : "",
      ]);
      out.push({
        id: "metrics",
        title: ROOM_EXTRA_LABEL.metrics,
        html: `${tableHtml(["Metric", ...months.map(label), "Target"], rows)}<p class="note">Money and counts are by calendar month; this month is so far.</p>`,
      });
    }
  }

  if (!forHandbook && extras.has("filings")) {
    const overview = buildDeadlines(db, company.id, now);
    const live = overview.obligations.filter((obligation) => obligation.active);
    if (live.length > 0) {
      const rows = live.map((obligation) => [
        obligation.title,
        describeRule(obligation.rule),
        day(obligation.nextDue),
        obligation.lastDone ? `${spellDay(obligation.lastDone.doneOn)} (due ${spellDay(obligation.lastDone.dueOn)})` : "Not yet",
      ]);
      out.push({ id: "filings", title: ROOM_EXTRA_LABEL.filings, html: tableHtml(["What", "When", "Next due", "Last done"], rows) });
    }
  }
  return out;
}

/* ---- The data room -------------------------------------------------------- */

/** One file in the zip: text written here, or a stored document copied from the store. */
type RoomFile = { name: string; text: string } | { name: string; source: string };

type RoomContents = { files: RoomFile[]; pages: number; documents: number; missing: number };

/** Pages and documents are numbered by section so a folder listing reads in the index's order. */
function numbered(position: number, label: string): string {
  return `${String(position + 1).padStart(2, "0")} ${safeName(label)}`;
}

function fileBase(title: string): string {
  return safeName(title).replace(/\.+$/, "").slice(0, 80).trim() || "Untitled";
}

function href(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

/**
 * What goes in the zip, as names and text. `store` is where stored documents
 * live - the attachments folder - passed in so a test can use its own.
 */
export function dataRoomContents(db: Db, companyId: string, raw: unknown, store: string, now: Date = new Date()): RoomContents {
  const input = roomInput.parse(raw);
  const company = companyOf(db, companyId);
  const { name, oneLiner } = displayName(db, company);
  const chosen = chosenPages(db, companyId, input.sections);
  const extras = new Set(input.extras);
  const categories = new Set(input.categories.filter((id): id is DocumentCategory => (DOCUMENT_CATEGORIES as readonly string[]).includes(id)));
  const documents = documentsOf(db, companyId).filter((row) => categories.has(row.category));

  if (chosen.length === 0 && documents.length === 0 && extras.size === 0) {
    throw new Error("Tick something to put in it: a section, a kind of document, or one of the tables.");
  }

  // Every page's file first, so a link can point at a page written after it.
  const paths = new Map<string, string>();
  const used = new Set<string>();
  const unique = (path: string) => {
    let candidate = path;
    let n = 2;
    while (used.has(candidate.toLowerCase())) {
      candidate = path.replace(/\.html$/, ` (${n}).html`);
      n += 1;
    }
    used.add(candidate.toLowerCase());
    return candidate;
  };
  const sectionOrder = offeredSections().map((section) => section.id);
  for (const { section, pages } of chosen) {
    const folder = `pages/${numbered(sectionOrder.indexOf(section.id), section.label)}`;
    for (const page of pages) paths.set(page.id, unique(`${folder}/${fileBase(page.title)}.html`));
  }

  const names = namesOf(db, companyId);
  const resolverFrom = (from: string): LinkResolver => (kind, id, label) => {
    const key = `${kind}:${id}`;
    const text = names.get(key) ?? label;
    if (kind === "page" && paths.has(id)) return { href: href(posix.relative(posix.dirname(from), paths.get(id) ?? "")), text };
    return { href: null, text };
  };

  const files: RoomFile[] = [];
  for (const { pages } of chosen) {
    for (const page of pages) {
      const path = paths.get(page.id) ?? "";
      const back = posix.relative(posix.dirname(path), "index.html");
      const body = [
        `<a class="back" href="${escapeHtml(href(back))}">← ${escapeHtml(name)} data room</a>`,
        pageBody(page, company.currency, input.secrets, resolverFrom(path), `<h1>${escapeHtml(page.title)}</h1>`),
      ].join("\n");
      files.push({ name: path, text: documentHtml(`${page.title} · ${name}`, body) });
    }
  }

  // Documents: a stored file goes in the zip; a written-down one is listed with where it is.
  let missing = 0;
  let copied = 0;
  const documentRows: { category: DocumentCategory; cells: (string | { html: string })[] }[] = [];
  const categoryOrder: readonly DocumentCategory[] = DOCUMENT_CATEGORIES;
  for (const row of documents) {
    let where: string | { html: string } = row.location ? `Kept at ${row.location}` : "";
    if (row.file) {
      const source = join(store, basename(row.file));
      if (existsSync(source)) {
        const extension = extname(row.file);
        const base = fileBase(row.name.replace(new RegExp(`${extension.replace(".", "\\.")}$`, "i"), ""));
        const path = unique(`documents/${numbered(categoryOrder.indexOf(row.category), DOCUMENT_CATEGORY_LABEL[row.category])}/${base}${extension}`);
        files.push({ name: path, source });
        where = { html: `<a href="${escapeHtml(href(path))}">Open the file</a>` };
        copied += 1;
      } else {
        where = "The file is missing from this computer";
        missing += 1;
      }
    }
    documentRows.push({
      category: row.category,
      cells: [row.name, row.expires_on ? spellDay(row.expires_on) : "", where, row.notes ?? ""],
    });
  }

  const tables = extrasHtml(db, company, extras, false, now);
  const pageCount = chosen.reduce((sum, entry) => sum + entry.pages.length, 0);
  const today = todayIn(company.timezone, now);
  const me = readMe(db).name;

  const contents: string[] = [];
  if (pageCount > 0) contents.push(`<li><a href="#pages">Pages</a> (${pageCount})</li>`);
  for (const table of tables) contents.push(`<li><a href="#${table.id}">${escapeHtml(table.title)}</a></li>`);
  if (documentRows.length > 0) contents.push(`<li><a href="#documents">Documents</a> (${documentRows.length})</li>`);

  const index: string[] = [
    `<h1>${escapeHtml(name)} data room</h1>`,
    oneLiner ? `<p>${escapeHtml(oneLiner)}</p>` : "",
    `<p class="sub">Prepared ${escapeHtml(spellDay(today))}${me ? ` by ${escapeHtml(me)}` : ""}.${
      input.secrets ? "" : " Registration and account numbers are masked."
    }</p>`,
    `<ol class="toc">${contents.join("")}</ol>`,
  ];

  if (pageCount > 0) {
    index.push(`<h2 id="pages">Pages</h2>`);
    for (const { section, pages } of chosen) {
      index.push(`<h3>${escapeHtml(section.label)}</h3>`, "<ul>");
      for (const page of pages) {
        index.push(
          `<li><a href="${escapeHtml(href(paths.get(page.id) ?? ""))}">${escapeHtml(page.title)}</a> <span class="note">${escapeHtml(
            templateOf(page.template).name,
          )} · updated ${escapeHtml(spellDay(page.updated_at.slice(0, 10)))}</span></li>`,
        );
      }
      index.push("</ul>");
    }
  }
  for (const table of tables) index.push(`<h2 id="${table.id}">${escapeHtml(table.title)}</h2>`, table.html);
  if (documentRows.length > 0) {
    index.push(`<h2 id="documents">Documents</h2>`);
    for (const category of categoryOrder) {
      const mine = documentRows.filter((row) => row.category === category);
      if (mine.length === 0) continue;
      index.push(`<h3>${escapeHtml(DOCUMENT_CATEGORY_LABEL[category])}</h3>`, tableHtml(["Document", "Expires", "File", "Notes"], mine.map((row) => row.cells)));
    }
  }

  files.unshift({ name: "index.html", text: documentHtml(`${name} data room`, index.join("\n")) });
  return { files, pages: pageCount, documents: copied, missing };
}

/** Writes the contents to a zip at `path`; returns its size in bytes. Removes a half-written file on failure. */
export function writeZip(contents: RoomContents, path: string, now: Date = new Date()): number {
  const zip = new ZipWriter(path);
  try {
    for (const file of contents.files) {
      zip.add(file.name, "text" in file ? Buffer.from(file.text, "utf8") : readFileSync(file.source), now);
    }
    return zip.finish();
  } catch (error) {
    zip.abandon();
    throw error;
  }
}

/* ---- The handbook ---------------------------------------------------------- */

/** The handbook as one HTML document, ready for the printer. */
export function handbookHtml(db: Db, companyId: string, raw: unknown, now: Date = new Date()): { html: string; pages: number; title: string } {
  const input = handbookInput.parse(raw);
  const company = companyOf(db, companyId);
  const { name, oneLiner } = displayName(db, company);
  const chosen = chosenPages(db, companyId, input.sections);
  const extras = new Set(input.extras.filter((extra) => HANDBOOK_EXTRAS.includes(extra)));
  const tables = extrasHtml(db, company, extras, true, now);
  if (chosen.length === 0 && tables.length === 0) {
    throw new Error("Tick a section with pages in it, or the people or the products, to make a handbook of.");
  }

  const included = new Set(chosen.flatMap((entry) => entry.pages.map((page) => page.id)));
  const names = namesOf(db, companyId);
  const resolve: LinkResolver = (kind, id, label) => {
    const text = names.get(`${kind}:${id}`) ?? label;
    return kind === "page" && included.has(id) ? { href: `#page-${id}`, text } : { href: null, text };
  };

  const today = todayIn(company.timezone, now);
  const logo = company.logo && /^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,/i.test(company.logo) ? company.logo : null;

  const chapters: string[] = [];
  const contents: string[] = [];
  chosen.forEach(({ section, pages }, index) => {
    const anchor = `chapter-${index + 1}`;
    contents.push(`<li><a href="#${anchor}">${escapeHtml(section.label)}</a></li>`);
    chapters.push(`<section class="chapter" id="${anchor}"><h1>${escapeHtml(section.label)}</h1>`);
    for (const page of pages) {
      chapters.push(
        `<article class="page" id="page-${escapeHtml(page.id)}">${pageBody(page, company.currency, input.secrets, resolve, `<h2>${escapeHtml(page.title)}</h2>`)}</article>`,
      );
    }
    chapters.push("</section>");
  });
  tables.forEach((table) => {
    contents.push(`<li><a href="#${table.id}">${escapeHtml(table.title)}</a></li>`);
    chapters.push(`<section class="chapter" id="${table.id}"><h1>${escapeHtml(table.title)}</h1>${table.html}</section>`);
  });

  const cover = [
    `<section class="cover">`,
    logo ? `<img class="logo" src="${escapeHtml(logo)}" alt="">` : "",
    `<p class="what">Company handbook</p>`,
    `<h1>${escapeHtml(name)}</h1>`,
    oneLiner ? `<p class="oneliner">${escapeHtml(oneLiner)}</p>` : "",
    `<p class="sub">${escapeHtml(spellDay(today))}.${input.secrets ? "" : " Registration and account numbers are masked."}</p>`,
    `<h2>Contents</h2><ol class="toc">${contents.join("")}</ol>`,
    `</section>`,
  ].join("\n");

  const title = `${name} handbook`;
  return {
    html: documentHtml(title, [cover, ...chapters].join("\n")),
    pages: included.size,
    title,
  };
}
