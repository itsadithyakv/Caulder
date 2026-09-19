import type { Db } from "../db/connection";
import type { BrainSectionId } from "@shared/brain";
import { keyOf, type LinkKind, type LinkRef, type LinkTarget, type LinkedName } from "@shared/links";
import { mapKindOf, type MapGraph, type MapLink, type MapNode, type MapPosition } from "@shared/map";
import { DOCUMENT_CATEGORY_LABEL, type DocumentCategory } from "@shared/deadlines";
import { PERSON_KIND_LABEL, type PersonKind } from "@shared/people";

/**
 * Links, and the Map built from them (PLAN.md, phases 7 and 16).
 *
 * A page's links are replaced whenever the page is saved, from what its text
 * says now. A link that was already there keeps the moment it was first made,
 * which is what the Map's replay grows the company in the order of.
 *
 * A link reaches a page, a contact, a product, a person or a document. The
 * Map draws those, and beside the links written in pages it draws the ones
 * Caulder already knows: a person who is a contact, a product and each
 * contact who has been invoiced for it, a document and the contact or page
 * it belongs to.
 */

type TargetRow = { id: string; name: string; section: BrainSectionId | null };

export function replaceLinks(
  db: Db,
  companyId: string,
  pageId: string,
  targets: readonly (LinkRef & { label: string })[],
  now: string,
): void {
  const before = new Map(
    (
      db.prepare(`SELECT to_kind, to_id, created_at FROM brain_links WHERE from_page = ?`).all(pageId) as {
        to_kind: LinkKind;
        to_id: string;
        created_at: string;
      }[]
    ).map((row) => [`${row.to_kind}:${row.to_id}`, row.created_at]),
  );

  const known = resolveNames(db, companyId, targets);
  const insert = db.prepare(
    `INSERT INTO brain_links (company_id, from_page, to_kind, to_id, label, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );

  db.transaction(() => {
    db.prepare(`DELETE FROM brain_links WHERE from_page = ?`).run(pageId);
    for (const target of targets) {
      const key = keyOf(target);
      // Only to something that exists in this company, and never to itself.
      if (!known[key] || (target.kind === "page" && target.id === pageId)) continue;
      insert.run(companyId, pageId, target.kind, target.id, target.label, before.get(key) ?? now);
    }
  })();
}

/** Where each kind of thing is found, and its name there. */
const NAMED: Record<LinkKind, string> = {
  page: `SELECT id, title AS name, section FROM brain_pages WHERE id = ? AND company_id = ?`,
  contact: `SELECT id, name, NULL AS section FROM leads WHERE id = ? AND company_id = ?`,
  product: `SELECT id, name, NULL AS section FROM products WHERE id = ? AND company_id = ?`,
  person: `SELECT id, name, NULL AS section FROM people WHERE id = ? AND company_id = ?`,
  document: `SELECT id, name, NULL AS section FROM documents WHERE id = ? AND company_id = ?`,
};

/** The current name of each target that still exists in this company. */
export function resolveNames(
  db: Db,
  companyId: string,
  refs: readonly LinkRef[],
): Record<string, LinkedName> {
  const out: Record<string, LinkedName> = {};
  const found = (kind: LinkKind, id: string) => db.prepare(NAMED[kind]).get(id, companyId) as TargetRow | undefined;
  for (const ref of refs) {
    const row = found(ref.kind, ref.id);
    if (row) out[keyOf(ref)] = { name: row.name, kind: mapKindOf(ref.kind, row.section) };
  }
  return out;
}

/** The pages that link to anything, live ones first. */
export function backlinkIds(db: Db, ref: LinkRef): string[] {
  return (
    db
      .prepare(
        `SELECT p.id FROM brain_links l
         JOIN brain_pages p ON p.id = l.from_page
         WHERE l.to_kind = ? AND l.to_id = ?
         ORDER BY p.is_archived, p.updated_at DESC`,
      )
      .all(ref.kind, ref.id) as { id: string }[]
  ).map((row) => row.id);
}

/**
 * What `[[` offers: pages, contacts, products, people and documents whose
 * name contains what was typed, those starting with it first. Archived pages
 * are left out - a link is a thing you mean to follow.
 */
export function linkCandidates(db: Db, companyId: string, text: string, limit = 10): LinkTarget[] {
  const query = text.trim();
  const like = `%${query.replace(/[\\%_]/g, "\\$&")}%`;
  const starts = `${query.replace(/[\\%_]/g, "\\$&")}%`;

  const pages = db
    .prepare(
      `SELECT id, title AS name, section FROM brain_pages
       WHERE company_id = ? AND is_archived = 0 AND title LIKE ? ESCAPE '\\'
       ORDER BY (title LIKE ? ESCAPE '\\') DESC, updated_at DESC LIMIT ?`,
    )
    .all(companyId, like, starts, limit) as TargetRow[];

  const contacts = db
    .prepare(
      `SELECT id, name, city AS section FROM leads
       WHERE company_id = ? AND (name LIKE ? ESCAPE '\\' OR contact_person LIKE ? ESCAPE '\\')
       ORDER BY (name LIKE ? ESCAPE '\\') DESC, updated_at DESC LIMIT ?`,
    )
    .all(companyId, like, like, starts, limit) as { id: string; name: string; section: string | null }[];

  const products = db
    .prepare(
      `SELECT id, name, unit AS detail FROM products
       WHERE company_id = ? AND name LIKE ? ESCAPE '\\'
       ORDER BY (name LIKE ? ESCAPE '\\') DESC, name LIMIT ?`,
    )
    .all(companyId, like, starts, limit) as { id: string; name: string; detail: string | null }[];

  const people = db
    .prepare(
      `SELECT id, name, kind, role FROM people
       WHERE company_id = ? AND name LIKE ? ESCAPE '\\'
       ORDER BY (name LIKE ? ESCAPE '\\') DESC, name LIMIT ?`,
    )
    .all(companyId, like, starts, limit) as { id: string; name: string; kind: PersonKind; role: string | null }[];

  const documents = db
    .prepare(
      `SELECT id, name, category FROM documents
       WHERE company_id = ? AND name LIKE ? ESCAPE '\\'
       ORDER BY (name LIKE ? ESCAPE '\\') DESC, updated_at DESC LIMIT ?`,
    )
    .all(companyId, like, starts, limit) as { id: string; name: string; category: DocumentCategory }[];

  const lower = query.toLowerCase();
  const ranked: LinkTarget[] = [
    ...pages.map((row) => ({ kind: "page" as const, id: row.id, name: row.name, detail: row.section ?? "" })),
    ...contacts.map((row) => ({ kind: "contact" as const, id: row.id, name: row.name, detail: row.section ?? "" })),
    ...products.map((row) => ({ kind: "product" as const, id: row.id, name: row.name, detail: row.detail ? `Per ${row.detail}` : "" })),
    ...people.map((row) => ({
      kind: "person" as const,
      id: row.id,
      name: row.name,
      detail: row.role ?? PERSON_KIND_LABEL[row.kind] ?? "",
    })),
    ...documents.map((row) => ({
      kind: "document" as const,
      id: row.id,
      name: row.name,
      detail: DOCUMENT_CATEGORY_LABEL[row.category] ?? "",
    })),
  ];
  ranked.sort((a, b) => {
    const aStarts = a.name.toLowerCase().startsWith(lower) ? 0 : 1;
    const bStarts = b.name.toLowerCase().startsWith(lower) ? 0 : 1;
    return aStarts - bStarts;
  });
  return ranked.slice(0, limit);
}

/** Invoices handed to a customer are the contact's, not the company's picture: on the Map only when a page links one. */
const PAPERWORK: readonly DocumentCategory[] = ["invoice-sent", "invoice-received"];

/**
 * The whole map for a company: every live page, every product, everybody on
 * the team, the documents that are the company's (a sent invoice only when a
 * page links it), and every contact something reaches - or every contact,
 * when asked. A spreadsheet of two thousand leads drawn as two thousand loose
 * dots is not a picture of the company, so the unreached ones are left out
 * unless wanted.
 */
export function buildGraph(db: Db, companyId: string, options: { allContacts: boolean }): MapGraph {
  const positions = new Map(
    (
      db.prepare(`SELECT node, x, y, pinned FROM map_positions WHERE company_id = ?`).all(companyId) as {
        node: string;
        x: number;
        y: number;
        pinned: number;
      }[]
    ).map((row) => [row.node, row]),
  );

  const byKey = new Map<string, MapNode>();
  const add = (ref: LinkKind, row: { id: string; name: string; section: BrainSectionId | null; created_at: string }) => {
    const key = `${ref}:${row.id}`;
    const at = positions.get(key);
    byKey.set(key, {
      key,
      ref,
      id: row.id,
      kind: mapKindOf(ref, row.section),
      label: row.name,
      section: row.section,
      createdAt: row.created_at,
      degree: 0,
      x: at?.x ?? null,
      y: at?.y ?? null,
      pinned: at?.pinned === 1,
    });
  };

  type Row = { id: string; name: string; section: BrainSectionId | null; created_at: string };
  for (const row of db
    .prepare(`SELECT id, title AS name, section, created_at FROM brain_pages WHERE company_id = ? AND is_archived = 0`)
    .all(companyId) as Row[]) {
    add("page", row);
  }
  for (const row of db
    .prepare(`SELECT id, name, NULL AS section, created_at FROM products WHERE company_id = ?`)
    .all(companyId) as Row[]) {
    add("product", row);
  }

  // Lines written in pages, and the ones the tables already know - kept as keys until the dots are settled.
  const written = db
    .prepare(`SELECT from_page, to_kind, to_id, created_at FROM brain_links WHERE company_id = ?`)
    .all(companyId) as { from_page: string; to_kind: LinkKind; to_id: string; created_at: string }[];
  const linkedTo = new Set(written.map((row) => `${row.to_kind}:${row.to_id}`));

  const people = db
    .prepare(`SELECT id, name, kind, lead_id, created_at FROM people WHERE company_id = ?`)
    .all(companyId) as { id: string; name: string; kind: string; lead_id: string | null; created_at: string }[];
  for (const row of people) {
    // A candidate is on the map only when a page is about them.
    if (row.kind === "candidate" && !linkedTo.has(`person:${row.id}`)) continue;
    add("person", { id: row.id, name: row.name, section: null, created_at: row.created_at });
  }

  const documents = db
    .prepare(`SELECT id, name, category, lead_id, page_id, created_at FROM documents WHERE company_id = ?`)
    .all(companyId) as { id: string; name: string; category: DocumentCategory; lead_id: string | null; page_id: string | null; created_at: string }[];
  for (const row of documents) {
    if (PAPERWORK.includes(row.category) && !linkedTo.has(`document:${row.id}`)) continue;
    add("document", { id: row.id, name: row.name, section: null, created_at: row.created_at });
  }

  const known: { source: string; target: string; createdAt: string }[] = [];
  for (const row of written) {
    known.push({ source: `page:${row.from_page}`, target: `${row.to_kind}:${row.to_id}`, createdAt: row.created_at });
  }
  for (const row of people) {
    if (row.lead_id) known.push({ source: `person:${row.id}`, target: `contact:${row.lead_id}`, createdAt: row.created_at });
  }
  for (const row of documents) {
    if (row.lead_id) known.push({ source: `document:${row.id}`, target: `contact:${row.lead_id}`, createdAt: row.created_at });
    if (row.page_id) known.push({ source: `document:${row.id}`, target: `page:${row.page_id}`, createdAt: row.created_at });
  }
  // Who bought what: a product and each contact invoiced for it, from the first time they were.
  for (const row of db
    .prepare(
      `SELECT l.product_id, i.lead_id, MIN(i.issued_on) AS first FROM invoice_lines l
         JOIN invoices i ON i.id = l.invoice_id
        WHERE i.company_id = ? AND i.status NOT IN ('draft', 'void') AND l.product_id IS NOT NULL
        GROUP BY l.product_id, i.lead_id`,
    )
    .all(companyId) as { product_id: string; lead_id: string; first: string }[]) {
    known.push({ source: `product:${row.product_id}`, target: `contact:${row.lead_id}`, createdAt: `${row.first}T00:00:00.000Z` });
  }

  // Contacts: the ones something reaches, or all of them.
  const reached = new Set(known.flatMap((link) => [link.source, link.target]).filter((key) => key.startsWith("contact:")));
  for (const row of db
    .prepare(
      options.allContacts
        ? `SELECT id, name, NULL AS section, created_at FROM leads WHERE company_id = ? LIMIT 3000`
        : `SELECT id, name, NULL AS section, created_at FROM leads WHERE company_id = ?`,
    )
    .all(companyId) as Row[]) {
    if (options.allContacts || reached.has(`contact:${row.id}`)) add("contact", row);
  }

  const links: MapLink[] = [];
  const seen = new Set<string>();
  for (const link of known) {
    const source = byKey.get(link.source);
    const target = byKey.get(link.target);
    if (!source || !target || source === target) continue;
    const pair = [link.source, link.target].sort().join("|");
    if (seen.has(pair)) continue;
    seen.add(pair);
    source.degree += 1;
    target.degree += 1;
    links.push({ source: source.key, target: target.key, createdAt: link.createdAt });
  }

  return { nodes: [...byKey.values()], links };
}

/** Where the dots were left. Unknown node keys are refused rather than stored. */
export function savePositions(db: Db, companyId: string, positions: readonly MapPosition[]): void {
  const upsert = db.prepare(
    `INSERT INTO map_positions (company_id, node, x, y, pinned) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (company_id, node) DO UPDATE SET x = excluded.x, y = excluded.y, pinned = excluded.pinned`,
  );
  db.transaction(() => {
    for (const position of positions) {
      if (!/^(page|contact|product|person|document):[0-9a-f-]{36}$/.test(position.key)) continue;
      if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) continue;
      upsert.run(companyId, position.key, position.x, position.y, position.pinned ? 1 : 0);
    }
  })();
}

export function unpinAll(db: Db, companyId: string): void {
  db.prepare(`UPDATE map_positions SET pinned = 0 WHERE company_id = ?`).run(companyId);
}
