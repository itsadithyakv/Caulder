import { randomUUID } from "node:crypto";
import type { Db } from "../db/connection";
import {
  BRAIN_SECTIONS,
  PERSONAL_SQL,
  maskSecret,
  type BrainPage,
  type BrainPageSummary,
  type BrainRevision,
  type BrainSectionId,
  type ChecklistPage,
  type FieldValue,
} from "@shared/brain";
import { plainText } from "@shared/markdown";
import { linkTargets } from "@shared/links";
import { replaceLinks, resolveNames } from "./links";
import { readMe } from "./me";

/**
 * Brain pages and their revisions.
 *
 * Fields arrive here already checked and with any secret already sealed; this
 * file only stores and reads. What a page's JSON holds:
 *
 *   { "legalName": "Unifloe Pvt Ltd", "pan": { "$secret": "…", "last4": "234F" } }
 *
 * Every save writes a revision, except that saves a few minutes apart are one
 * revision: a page written in five sittings over a morning is five versions,
 * a page saved five times while being written is one.
 */

/** Saves closer together than this are one revision. */
const MERGE_MS = 5 * 60 * 1000;

type PageRow = {
  id: string;
  company_id: string;
  section: BrainSectionId;
  template: string;
  title: string;
  body: string;
  fields: string;
  is_pinned: number;
  is_archived: number;
  revision: number;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
  sync_revision: number | null;
  sync_dirty: number;
};

type Sealed = { $secret: string; last4: string };
export type StoredValue = FieldValue | Sealed;
export type StoredFields = Record<string, StoredValue>;

function isSealedValue(value: unknown): value is Sealed {
  return typeof value === "object" && value !== null && "$secret" in value;
}

/** A page's JSON, forgiving of anything that is not an object. */
function readStored(raw: string): StoredFields {
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as StoredFields)
      : {};
  } catch {
    return {};
  }
}

/** Plain fields and masked secrets, which is all that leaves main. */
function split(stored: StoredFields): {
  fields: Record<string, FieldValue>;
  secrets: Record<string, string>;
} {
  const fields: Record<string, FieldValue> = {};
  const secrets: Record<string, string> = {};
  for (const [key, value] of Object.entries(stored)) {
    if (isSealedValue(value)) secrets[key] = maskSecret(value.last4);
    else fields[key] = value;
  }
  return { fields, secrets };
}

function toPage(db: Db, row: PageRow): BrainPage {
  return {
    id: row.id,
    companyId: row.company_id,
    section: row.section,
    template: row.template,
    title: row.title,
    body: row.body,
    ...split(readStored(row.fields)),
    links: resolveNames(db, row.company_id, linkTargets(row.body)),
    isPinned: row.is_pinned === 1,
    isArchived: row.is_archived === 1,
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
    editedTogether:
      (
        db.prepare(`SELECT concurrent FROM brain_revisions WHERE page_id = ? ORDER BY revision DESC LIMIT 1`).get(row.id) as
          | { concurrent: number }
          | undefined
      )?.concurrent === 1,
  };
}

/**
 * The first words someone wrote. Headings are left out: on a page still
 * holding its template's prompts they are all there is, and a list of pages
 * each saying "The pitch What makes us different" says nothing.
 */
function excerptOf(body: string): string {
  const written = body
    .split("\n")
    .filter((line) => !/^#{1,6}\s/.test(line))
    .join("\n");
  return plainText(written).slice(0, 160);
}

function toSummary(row: PageRow): BrainPageSummary {
  return {
    id: row.id,
    section: row.section,
    template: row.template,
    title: row.title,
    isPinned: row.is_pinned === 1,
    isArchived: row.is_archived === 1,
    updatedAt: row.updated_at,
    excerpt: excerptOf(row.body),
  };
}

export function findPageRow(db: Db, id: string): (PageRow & { stored: StoredFields }) | null {
  const row = db.prepare(`SELECT * FROM brain_pages WHERE id = ?`).get(id) as PageRow | undefined;
  return row ? { ...row, stored: readStored(row.fields) } : null;
}

export function findPage(db: Db, id: string): BrainPage | null {
  const row = db.prepare(`SELECT * FROM brain_pages WHERE id = ?`).get(id) as PageRow | undefined;
  return row ? toPage(db, row) : null;
}

/** The one page a company has from a single template, archived or not. */
export function findSingle(db: Db, companyId: string, template: string): BrainPage | null {
  const row = db
    .prepare(`SELECT * FROM brain_pages WHERE company_id = ? AND template = ? ORDER BY created_at LIMIT 1`)
    .get(companyId, template) as PageRow | undefined;
  return row ? toPage(db, row) : null;
}

export function createPage(
  db: Db,
  companyId: string,
  page: { section: BrainSectionId; template: string; title: string; body: string; fields?: StoredFields },
  now: string,
): string {
  const id = randomUUID();
  const fields = JSON.stringify(page.fields ?? {});
  const author = readMe(db).name;
  db.transaction(() => {
    db.prepare(
      `INSERT INTO brain_pages (id, company_id, section, template, title, body, fields,
                                revision, created_at, updated_at, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
    ).run(id, companyId, page.section, page.template, page.title, page.body, fields, now, now, author);
    db.prepare(
      `INSERT INTO brain_revisions (id, page_id, revision, title, body, fields, edited_at, edited_by)
       VALUES (?, ?, 1, ?, ?, ?, ?, ?)`,
    ).run(randomUUID(), id, page.title, page.body, fields, now, author);
    replaceLinks(db, companyId, id, linkTargets(page.body), now);
  })();
  return id;
}

/**
 * Writes a new version of a page.
 *
 * Refused when the edit started from an older revision than the page now has:
 * somebody else - another window today, the other founder later - saved in
 * between, and writing over them silently is the one thing a history must
 * never do. Nothing is written when nothing changed.
 */
export function savePageRow(
  db: Db,
  id: string,
  next: { title: string; body: string; fields: StoredFields },
  baseRevision: number,
  now: string,
  /** False for a save that must stand as its own version: putting an old one back. */
  merge = true,
): void {
  db.transaction(() => {
    const row = findPageRow(db, id);
    if (!row) throw new Error("That page no longer exists.");
    if (row.revision !== baseRevision) {
      throw new Error(
        "This page was changed since you opened it. Copy what you wrote, open the page again, and add it back.",
      );
    }

    const fields = JSON.stringify(next.fields);
    if (row.title === next.title && row.body === next.body && row.fields === fields) return;

    const author = readMe(db).name;
    const revision = row.revision + 1;
    db.prepare(
      `UPDATE brain_pages SET title = ?, body = ?, fields = ?, revision = ?, updated_at = ?, updated_by = ?
       WHERE id = ?`,
    ).run(next.title, next.body, fields, revision, now, author, id);

    const latest = db
      .prepare(
        `SELECT id, edited_at, edited_by, concurrent FROM brain_revisions WHERE page_id = ? ORDER BY revision DESC LIMIT 1`,
      )
      .get(id) as { id: string; edited_at: string; edited_by: string | null; concurrent: number } | undefined;

    // Saves a few minutes apart are one version - but only the same person's,
    // and never one that stands for writing at the same time as the other founder.
    if (
      merge &&
      latest &&
      latest.edited_by === author &&
      latest.concurrent === 0 &&
      Date.parse(now) - Date.parse(latest.edited_at) < MERGE_MS &&
      revision > 2
    ) {
      db.prepare(
        `UPDATE brain_revisions SET revision = ?, title = ?, body = ?, fields = ?, edited_at = ?
         WHERE id = ?`,
      ).run(revision, next.title, next.body, fields, now, latest.id);
    } else {
      db.prepare(
        `INSERT INTO brain_revisions (id, page_id, revision, title, body, fields, edited_at, edited_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(randomUUID(), id, revision, next.title, next.body, fields, now, author);
    }

    replaceLinks(db, row.company_id, id, linkTargets(next.body), now);
  })();
}

export function setPagePinned(db: Db, id: string, pinned: boolean): void {
  db.prepare(`UPDATE brain_pages SET is_pinned = ? WHERE id = ?`).run(pinned ? 1 : 0, id);
}

export function setPageArchived(db: Db, id: string, archived: boolean, now: string): void {
  db.prepare(`UPDATE brain_pages SET is_archived = ?, is_pinned = 0, updated_at = ?, updated_by = ? WHERE id = ?`).run(
    archived ? 1 : 0,
    now,
    readMe(db).name,
    id,
  );
}

/* ---- Pages from somewhere else: the shared brain, or a brain file ---------- */

/** A page as it travels: everything but the pin, which is each founder's own, and the secrets, which never leave. */
export type TravellingPage = {
  section: BrainSectionId;
  template: string;
  title: string;
  body: string;
  fields: Record<string, FieldValue>;
  isArchived: boolean;
};

type Arrival = {
  author: string | null;
  editedAt: string;
  /** Written at the same time as a version this side did not see. */
  concurrent: boolean;
  /** The shared log's revision, when it came from there; null from a file. */
  syncRevision: number | null;
};

/** What a page sends: its content, secrets left out. */
export function travellingOf(row: { section: BrainSectionId; template: string; title: string; body: string; fields: string; is_archived: number }): TravellingPage {
  const fields: Record<string, FieldValue> = {};
  for (const [key, value] of Object.entries(readStored(row.fields))) {
    if (!isSealedValue(value)) fields[key] = value;
  }
  return { section: row.section, template: row.template, title: row.title, body: row.body, fields, isArchived: row.is_archived === 1 };
}

/** The incoming fields with this side's secrets kept: a secret never travels, so it is never overwritten. */
function withOwnSecrets(incoming: Record<string, FieldValue>, stored: string): string {
  const kept: StoredFields = { ...incoming };
  for (const [key, value] of Object.entries(readStored(stored))) {
    if (isSealedValue(value)) kept[key] = value;
  }
  return JSON.stringify(kept);
}

function nextRevision(
  db: Db,
  pageId: string,
  revision: number,
  content: { title: string; body: string; fields: string },
  author: string | null,
  editedAt: string,
  concurrent: boolean,
): void {
  db.prepare(
    `INSERT INTO brain_revisions (id, page_id, revision, title, body, fields, edited_at, edited_by, concurrent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(randomUUID(), pageId, revision, content.title, content.body, content.fields, editedAt, author, concurrent ? 1 : 0);
}

/** A page this side has never had. */
export function insertArrivedPage(db: Db, companyId: string, id: string, page: TravellingPage, arrival: Arrival): void {
  const fields = JSON.stringify(page.fields);
  db.prepare(
    `INSERT INTO brain_pages (id, company_id, section, template, title, body, fields, is_archived, revision,
                              created_at, updated_at, updated_by, sync_revision, sync_dirty)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    companyId,
    page.section,
    page.template,
    page.title,
    page.body,
    fields,
    page.isArchived ? 1 : 0,
    arrival.editedAt,
    arrival.editedAt,
    arrival.author,
    arrival.syncRevision,
    arrival.syncRevision === null ? 1 : 0,
  );
  nextRevision(db, id, 1, { title: page.title, body: page.body, fields }, arrival.author, arrival.editedAt, arrival.concurrent);
  replaceLinks(db, companyId, id, linkTargets(page.body), arrival.editedAt);
}

/**
 * A newer version of a page arriving, which becomes the page. From the shared
 * log it moves `sync_revision` in the same statement, which is what tells the
 * trigger not to send it straight back.
 */
export function applyArrivedEdit(db: Db, id: string, page: TravellingPage, arrival: Arrival): void {
  const row = db.prepare(`SELECT * FROM brain_pages WHERE id = ?`).get(id) as PageRow | undefined;
  if (!row) throw new Error("That page no longer exists.");
  const fields = withOwnSecrets(page.fields, row.fields);
  const revision = row.revision + 1;
  if (arrival.syncRevision !== null) {
    db.prepare(
      `UPDATE brain_pages SET section = ?, template = ?, title = ?, body = ?, fields = ?, is_archived = ?, revision = ?,
         updated_at = ?, updated_by = ?, sync_revision = ?
       WHERE id = ?`,
    ).run(page.section, page.template, page.title, page.body, fields, page.isArchived ? 1 : 0, revision, arrival.editedAt, arrival.author, arrival.syncRevision, id);
  } else {
    db.prepare(
      `UPDATE brain_pages SET section = ?, template = ?, title = ?, body = ?, fields = ?, is_archived = ?, revision = ?,
         updated_at = ?, updated_by = ?
       WHERE id = ?`,
    ).run(page.section, page.template, page.title, page.body, fields, page.isArchived ? 1 : 0, revision, arrival.editedAt, arrival.author, id);
  }
  nextRevision(db, id, revision, { title: page.title, body: page.body, fields }, arrival.author, arrival.editedAt, arrival.concurrent);
  replaceLinks(db, row.company_id, id, linkTargets(page.body), arrival.editedAt);
}

/**
 * Two versions written at the same time, when this side's is the one to keep
 * showing: the other goes into the history, and this side's is written again
 * on top of it, both marked. Nothing is lost and the page does not change
 * under anyone's eyes; the History says there were two.
 */
export function keepBothVersions(db: Db, id: string, other: TravellingPage, arrival: Arrival, now: string): void {
  const row = db.prepare(`SELECT * FROM brain_pages WHERE id = ?`).get(id) as PageRow | undefined;
  if (!row) throw new Error("That page no longer exists.");
  const theirs = withOwnSecrets(other.fields, row.fields);
  nextRevision(db, id, row.revision + 1, { title: other.title, body: other.body, fields: theirs }, arrival.author, arrival.editedAt, true);
  nextRevision(db, id, row.revision + 2, { title: row.title, body: row.body, fields: row.fields }, row.updated_by, now, true);
  // Only the number moves: the content is this side's still, so nothing is marked to send twice.
  db.prepare(`UPDATE brain_pages SET revision = ? WHERE id = ?`).run(row.revision + 2, id);
}

/** Marks the latest version as written at the same time as the other founder's. */
export function markEditedTogether(db: Db, id: string): void {
  db.prepare(
    `UPDATE brain_revisions SET concurrent = 1
      WHERE page_id = ? AND revision = (SELECT MAX(revision) FROM brain_revisions WHERE page_id = ?)`,
  ).run(id, id);
}

export function deletePage(db: Db, id: string): void {
  db.prepare(`DELETE FROM brain_pages WHERE id = ?`).run(id);
}

type RevisionRow = {
  revision: number;
  title: string;
  body: string;
  fields: string;
  edited_at: string;
  edited_by: string | null;
  concurrent: number;
};

function toRevision(row: RevisionRow): BrainRevision {
  return {
    revision: row.revision,
    title: row.title,
    body: row.body,
    ...split(readStored(row.fields)),
    editedAt: row.edited_at,
    editedBy: row.edited_by,
    concurrent: row.concurrent === 1,
  };
}

/** Newest first. A page's history is long before it is interesting, so it is capped. */
export function listRevisions(db: Db, pageId: string): BrainRevision[] {
  return (
    db
      .prepare(
        `SELECT revision, title, body, fields, edited_at, edited_by, concurrent FROM brain_revisions
         WHERE page_id = ? ORDER BY revision DESC LIMIT 200`,
      )
      .all(pageId) as RevisionRow[]
  ).map(toRevision);
}

/** One revision as stored, secrets still sealed, for putting back. */
export function findStoredRevision(
  db: Db,
  pageId: string,
  revision: number,
): { title: string; body: string; fields: StoredFields } | null {
  const row = db
    .prepare(`SELECT title, body, fields FROM brain_revisions WHERE page_id = ? AND revision = ?`)
    .get(pageId, revision) as { title: string; body: string; fields: string } | undefined;
  return row ? { title: row.title, body: row.body, fields: readStored(row.fields) } : null;
}

export function listSection(
  db: Db,
  companyId: string,
  section: BrainSectionId,
  archived: boolean,
): BrainPageSummary[] {
  return (
    db
      .prepare(
        `SELECT * FROM brain_pages
         WHERE company_id = ? AND section = ? AND is_archived = ?
         ORDER BY is_pinned DESC, updated_at DESC`,
      )
      .all(companyId, section, archived ? 1 : 0) as PageRow[]
  ).map(toSummary);
}

/** The company's pages written last: Brain home's list, and search before anything is typed. The founder's own are not the company's. */
export function listRecentPages(db: Db, companyId: string, limit: number): BrainPageSummary[] {
  return (
    db
      .prepare(
        `SELECT * FROM brain_pages WHERE company_id = ? AND is_archived = 0 AND section NOT IN (${PERSONAL_SQL})
         ORDER BY updated_at DESC LIMIT ?`,
      )
      .all(companyId, limit) as PageRow[]
  ).map(toSummary);
}

export function listPinnedPages(db: Db, companyId: string): BrainPageSummary[] {
  return (
    db
      .prepare(
        `SELECT * FROM brain_pages WHERE company_id = ? AND is_pinned = 1 AND is_archived = 0 AND section NOT IN (${PERSONAL_SQL})
         ORDER BY title COLLATE NOCASE`,
      )
      .all(companyId) as PageRow[]
  ).map(toSummary);
}

export function countBySection(db: Db, companyId: string): Record<BrainSectionId, number> {
  const counts = Object.fromEntries(BRAIN_SECTIONS.map((section) => [section, 0])) as Record<
    BrainSectionId,
    number
  >;
  const rows = db
    .prepare(
      `SELECT section, COUNT(*) AS n FROM brain_pages
       WHERE company_id = ? AND is_archived = 0 GROUP BY section`,
    )
    .all(companyId) as { section: BrainSectionId; n: number }[];
  for (const row of rows) counts[row.section] = row.n;
  return counts;
}

/** What the checklist reads: every live page's template and fields, secrets as "has one". */
export function checklistPages(db: Db, companyId: string): ChecklistPage[] {
  const rows = db
    .prepare(`SELECT template, fields FROM brain_pages WHERE company_id = ? AND is_archived = 0`)
    .all(companyId) as { template: string; fields: string }[];
  return rows.map((row) => {
    const { fields, secrets } = split(readStored(row.fields));
    return { template: row.template, fields, secretKeys: Object.keys(secrets) };
  });
}

/** Every page, stored as it is, for the export and the invoice. */
export function pagesOf(
  db: Db,
  companyId: string,
  template?: string,
): (Omit<PageRow, "fields"> & { stored: StoredFields })[] {
  const rows = (
    template
      ? db
          .prepare(
            `SELECT * FROM brain_pages WHERE company_id = ? AND template = ? AND is_archived = 0
             ORDER BY created_at`,
          )
          .all(companyId, template)
      : db
          .prepare(`SELECT * FROM brain_pages WHERE company_id = ? ORDER BY section, title COLLATE NOCASE`)
          .all(companyId)
  ) as PageRow[];
  return rows.map(({ fields, ...rest }) => ({ ...rest, stored: readStored(fields) }));
}

/** Pages as list rows, in the order given. */
export function summariesOf(db: Db, ids: readonly string[]): BrainPageSummary[] {
  const find = db.prepare(`SELECT * FROM brain_pages WHERE id = ?`);
  return ids
    .map((id) => find.get(id) as PageRow | undefined)
    .filter((row): row is PageRow => row !== undefined)
    .map(toSummary);
}
