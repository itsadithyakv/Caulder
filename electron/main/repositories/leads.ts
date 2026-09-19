import { randomUUID } from "node:crypto";
import type { Db } from "../db/connection";
import { MAIN_DEAL } from "./main-deal";
import { createDeal, findDeal, mainDeal, setDealStage, updateDeal } from "./deals";
import {
  countsAsContact,
  LEAD_SORT_DEFAULT_DIRECTION,
  type Activity,
  type ActivityInput,
  type ActivityKind,
  type Lead,
  type LeadInput,
  type LeadListRow,
  type LeadQuery,
  type LeadSort,
  type Relationship,
  type SortDirection,
  type TaskKind,
} from "@shared/domain";

/**
 * Leads and their timeline. Like the company repository, every function takes
 * its connection explicitly so these stay plain functions over a database.
 */

type LeadRow = {
  id: string;
  company_id: string;
  stage_id: string | null;
  name: string;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  alt_phone: string | null;
  location: string | null;
  city: string | null;
  pin: string | null;
  source: string | null;
  website: string | null;
  value: number | null;
  tags: string | null;
  notes: string | null;
  last_contacted_at: string | null;
  loss_reason: string | null;
  campaign_id: string | null;
  do_not_contact: number;
  relationship: Relationship;
  created_at: string;
  updated_at: string;
  /** From the main deal, joined in by LEAD_COLUMNS. */
  md_stage_id: string | null;
  md_value: number | null;
  md_loss_reason: string | null;
  deal_count: number;
};

/**
 * A contact's columns, with its main deal's stage, value and loss reason in
 * place of the old ones on `leads`, which nothing reads any more. Needs
 * `LEFT JOIN deals md ON md.id = <MAIN_DEAL>` beside it.
 */
const LEAD_COLUMNS = `l.*, md.stage_id AS md_stage_id, md.value AS md_value,
  md.loss_reason AS md_loss_reason,
  (SELECT COUNT(*) FROM deals dc WHERE dc.lead_id = l.id) AS deal_count`;

const MAIN_JOIN = `LEFT JOIN deals md ON md.id = ${MAIN_DEAL("l.id")}`;

type ActivityRow = {
  id: string;
  lead_id: string;
  kind: string;
  body: string | null;
  occurred_at: string;
  created_at: string;
};

function toLead(row: LeadRow): Lead {
  return {
    id: row.id,
    companyId: row.company_id,
    stageId: row.md_stage_id,
    name: row.name,
    contactPerson: row.contact_person,
    email: row.email,
    phone: row.phone,
    altPhone: row.alt_phone,
    location: row.location,
    city: row.city,
    pin: row.pin,
    source: row.source,
    website: row.website,
    value: row.md_value,
    tags: parseTags(row.tags),
    notes: row.notes,
    lastContactedAt: row.last_contacted_at,
    lossReason: row.md_loss_reason,
    campaignId: row.campaign_id,
    doNotContact: row.do_not_contact === 1,
    relationship: row.relationship,
    dealCount: row.deal_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Tags are stored as JSON. A malformed value must not break the whole list. */
function parseTags(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((t) => typeof t === "string") : [];
  } catch {
    return [];
  }
}

function toActivity(row: ActivityRow): Activity {
  return {
    id: row.id,
    leadId: row.lead_id,
    kind: row.kind as ActivityKind,
    body: row.body,
    occurredAt: row.occurred_at,
    createdAt: row.created_at,
  };
}

/**
 * How each column sorts, in both directions.
 *
 * Two rules run through all of them. **A missing value always sorts last**,
 * whichever way the arrow points: an unvalued lead is unknown, not worthless,
 * and a lead with nothing planned is not the most urgent thing on the list.
 * That is why every entry starts with an `IS NULL` term, which is constant
 * regardless of direction. And **name breaks every tie**, so a column of
 * identical stages is still in a stable, readable order rather than whatever
 * SQLite happens to return.
 */
const ORDER_BY: Record<LeadSort, Record<SortDirection, string>> = {
  recent: {
    desc: "l.updated_at DESC",
    asc: "l.updated_at ASC",
  },
  name: {
    asc: "l.name COLLATE NOCASE ASC",
    desc: "l.name COLLATE NOCASE DESC",
  },
  value: {
    desc: "md.value IS NULL, md.value DESC, l.name COLLATE NOCASE ASC",
    asc: "md.value IS NULL, md.value ASC, l.name COLLATE NOCASE ASC",
  },
  stage: {
    asc: "s.position IS NULL, s.position ASC, l.name COLLATE NOCASE ASC",
    desc: "s.position IS NULL, s.position DESC, l.name COLLATE NOCASE ASC",
  },
  next: {
    asc: "next_due IS NULL, next_due ASC, l.name COLLATE NOCASE ASC",
    desc: "next_due IS NULL, next_due DESC, l.name COLLATE NOCASE ASC",
  },
};

/**
 * The soonest open task per lead, as a correlated subquery.
 *
 * One query rather than one per row: at a couple of thousand leads a
 * per-row lookup is a couple of thousand round trips through the same
 * connection, and the list is re-read on every keystroke of the search box.
 */
const NEXT_TASK = `
  (SELECT t.due_on FROM tasks t
    WHERE t.lead_id = l.id AND t.status = 'open'
    ORDER BY t.due_on ASC LIMIT 1) AS next_due,
  (SELECT t.kind FROM tasks t
    WHERE t.lead_id = l.id AND t.status = 'open'
    ORDER BY t.due_on ASC LIMIT 1) AS next_kind,
  (SELECT t.title FROM tasks t
    WHERE t.lead_id = l.id AND t.status = 'open'
    ORDER BY t.due_on ASC LIMIT 1) AS next_title`;

export function listLeads(db: Db, query: LeadQuery): LeadListRow[] {
  const where: string[] = ["l.company_id = @companyId"];
  const params: Record<string, unknown> = { companyId: query.companyId };

  const search = query.search?.trim();
  if (search) {
    // One box across the fields somebody would actually recall a lead by.
    where.push(`(
      l.name           LIKE @like ESCAPE '\\' OR
      l.contact_person LIKE @like ESCAPE '\\' OR
      l.email          LIKE @like ESCAPE '\\' OR
      l.phone          LIKE @like ESCAPE '\\' OR
      l.alt_phone      LIKE @like ESCAPE '\\' OR
      l.city           LIKE @like ESCAPE '\\'
    )`);
    params["like"] = `%${escapeLike(search)}%`;
  }

  if (query.relationship) {
    where.push("l.relationship = @relationship");
    params["relationship"] = query.relationship;
  }

  // By the main deal's stage: the one the list shows. "No stage" is also a
  // contact with no deal at all.
  if (query.stageId === null) {
    where.push("md.stage_id IS NULL");
  } else if (typeof query.stageId === "string") {
    where.push("md.stage_id = @stageId");
    params["stageId"] = query.stageId;
  }

  // Both halves come from a fixed table rather than from the caller, so no
  // part of an ORDER BY is ever built from a string that crossed the bridge.
  const sort = ORDER_BY[query.sort ?? "recent"] ?? ORDER_BY["recent"];
  const order = sort[query.direction ?? LEAD_SORT_DEFAULT_DIRECTION[query.sort ?? "recent"]];

  const rows = db
    .prepare(
      `SELECT ${LEAD_COLUMNS}, ${NEXT_TASK}
       FROM leads l
       ${MAIN_JOIN}
       LEFT JOIN pipeline_stages s ON s.id = md.stage_id
       WHERE ${where.join(" AND ")}
       ORDER BY ${order}`,
    )
    .all(params) as ListRow[];

  return rows.map((row) => ({
    ...toLead(row),
    nextTaskDue: row.next_due ?? null,
    nextTaskKind: row.next_kind ?? null,
    nextTaskTitle: row.next_title ?? null,
  }));
}

type ListRow = LeadRow & {
  next_due: string | null;
  next_kind: TaskKind | null;
  next_title: string | null;
};

/**
 * LIKE treats % and _ as wildcards, so a search for "50%" would otherwise
 * match everything. ESCAPE is declared on the query side.
 */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

export function findLead(db: Db, id: string): Lead | null {
  const row = db.prepare(`SELECT ${LEAD_COLUMNS} FROM leads l ${MAIN_JOIN} WHERE l.id = ?`).get(id) as
    | LeadRow
    | undefined;
  return row ? toLead(row) : null;
}

/** The relationships a contact is sold to as. Only these start with a deal. */
const SELLING = new Set<Relationship>(["prospect", "customer"]);

/**
 * Creates a lead and opens its timeline in one transaction. A lead with no
 * history is missing the answer to "where did this come from".
 *
 * A contact you sell to - a prospect or a customer - starts with one deal,
 * named after it, in the stage given or else the company's first: a deal
 * outside the funnel is invisible on the board.
 */
export function createLead(db: Db, companyId: string, input: LeadInput): Lead {
  const now = new Date().toISOString();
  const id = randomUUID();

  const run = db.transaction(() => {
    db.prepare(
      `INSERT INTO leads (
         id, company_id, stage_id, name, contact_person, email, phone, alt_phone,
         location, city, pin, source, website, value, tags, notes,
         campaign_id, do_not_contact, relationship, last_contacted_at, created_at, updated_at
       ) VALUES (
         @id, @companyId, NULL, @name, @contactPerson, @email, @phone, @altPhone,
         @location, @city, @pin, @source, @website, NULL, '[]', @notes,
         @campaignId, @doNotContact, @relationship, NULL, @now, @now
       )`,
    ).run({
      ...input,
      id,
      companyId,
      now,
      // SQLite has no boolean, and better-sqlite3 refuses to bind one.
      doNotContact: input.doNotContact ? 1 : 0,
    });

    writeActivity(db, {
      companyId,
      leadId: id,
      kind: "created",
      body: null,
      occurredAt: now,
    });

    if (SELLING.has(input.relationship)) {
      createDeal(db, id, { title: input.name, stageId: input.stageId, value: input.value }, now);
    }
  });

  run();

  const created = findLead(db, id);
  if (!created) throw new Error("Lead vanished immediately after being created.");
  return created;
}

/**
 * Applies an edit and records what changed.
 *
 * The timeline entry names the fields rather than storing a full before-image:
 * the point is to explain later why a record looks the way it does, and a list
 * of field names does that without turning the timeline into a diff log.
 * Nothing is written when the edit changes nothing.
 */
export function updateLead(db: Db, id: string, input: LeadInput): Lead {
  const before = findLead(db, id);
  if (!before) throw new Error("That lead no longer exists.");

  const now = new Date().toISOString();
  // A contact with several deals has them edited as deals: the form's stage
  // and value say nothing about which one.
  const single = before.dealCount <= 1;
  const changed = changedFields(before, input).filter(
    (field) => single || (field !== "stage" && field !== "value"),
  );

  const run = db.transaction(() => {
    db.prepare(
      `UPDATE leads SET
         name = @name, contact_person = @contactPerson,
         email = @email, phone = @phone, alt_phone = @altPhone,
         location = @location, city = @city, pin = @pin, source = @source,
         website = @website, notes = @notes,
         campaign_id = @campaignId, do_not_contact = @doNotContact,
         relationship = @relationship, updated_at = @now
       WHERE id = @id`,
    ).run({ ...input, id, now, doNotContact: input.doNotContact ? 1 : 0 });

    if (single) {
      const deal = mainDeal(db, id);
      // A deal named after the contact follows its name.
      const title = deal && deal.title !== before.name ? deal.title : input.name;
      if (deal && (deal.stageId !== input.stageId || deal.value !== input.value || deal.title !== title)) {
        updateDeal(db, deal.id, { title, stageId: input.stageId, value: input.value });
      } else if (!deal && SELLING.has(input.relationship) && (input.stageId !== null || input.value !== null)) {
        createDeal(db, id, { title, stageId: input.stageId, value: input.value }, now);
      }
    }

    // The move itself is on the history already, written by the deal.
    const other = changed.filter((field) => field !== "stage");
    if (other.length > 0) {
      writeActivity(db, {
        companyId: before.companyId,
        leadId: id,
        kind: "field_change",
        body: other.join(", "),
        occurredAt: now,
      });
    }
  });

  run();

  const updated = findLead(db, id);
  if (!updated) throw new Error("That lead no longer exists.");
  return updated;
}

const TRACKED: { key: keyof LeadInput; label: string }[] = [
  { key: "name", label: "name" },
  { key: "contactPerson", label: "contact" },
  { key: "email", label: "email" },
  { key: "phone", label: "phone" },
  { key: "altPhone", label: "alt phone" },
  { key: "location", label: "location" },
  { key: "city", label: "city" },
  { key: "pin", label: "PIN" },
  { key: "source", label: "source" },
  { key: "website", label: "website" },
  { key: "value", label: "value" },
  { key: "notes", label: "notes" },
  { key: "stageId", label: "stage" },
  { key: "campaignId", label: "campaign" },
  { key: "doNotContact", label: "do not contact" },
  { key: "relationship", label: "relationship" },
];

function changedFields(before: Lead, input: LeadInput): string[] {
  return TRACKED.filter(({ key }) => {
    const was = key === "stageId" ? before.stageId : before[key as keyof Lead];
    return (was ?? null) !== (input[key] ?? null);
  }).map(({ label }) => label);
}


/**
 * Moving a contact on to a stage: its main deal moves, or, with no deal yet,
 * one is started. Used by a selection moved from the contacts list and by the
 * sample; the board moves deals themselves.
 */
export function setLeadStage(
  db: Db,
  id: string,
  stageId: string | null,
  /** False when the stage is being written rather than moved: the sample seed. */
  options: { followUp?: boolean } = {},
): Lead {
  const before = findLead(db, id);
  if (!before) throw new Error("That lead no longer exists.");
  if (before.stageId === stageId && before.dealCount > 0) return before;

  db.transaction(() => {
    const deal = mainDeal(db, id) ?? createDeal(db, id, { title: before.name, stageId: null, value: null });
    if (findDeal(db, deal.id)?.stageId !== stageId) setDealStage(db, deal.id, stageId, options);
  })();

  const updated = findLead(db, id);
  if (!updated) throw new Error("That lead no longer exists.");
  return updated;
}

/**
 * A real delete, unlike companies. A lead is one record rather than a
 * workspace, deleting one is a normal correction after a bad import, and its
 * timeline goes with it by cascade.
 */
export function deleteLead(db: Db, id: string): void {
  const result = db.prepare(`DELETE FROM leads WHERE id = ?`).run(id);
  if (result.changes === 0) throw new Error("That lead no longer exists.");
}

/* ---- Acting on a selection ----------------------------------------------
 * Both of these take a whole transaction. Selecting forty leads and moving
 * them is one decision, and "eleven of them moved" is not an outcome anybody
 * asked for or can easily undo by hand.
 *
 * They also skip anything that is not this company's, so a stale selection -
 * ids held on screen while the workspace changed underneath - cannot reach
 * into another company's leads.
 * ------------------------------------------------------------------------ */

/** Moves every selected lead to one stage. Returns how many actually moved. */
export function setStageForMany(
  db: Db,
  companyId: string,
  ids: string[],
  stageId: string | null,
): number {
  if (ids.length === 0) return 0;

  return db.transaction(() => {
    let moved = 0;
    for (const id of ids) {
      const lead = findLead(db, id);
      // Already there is not a failure, it is a no-op; setLeadStage returns
      // early for it and writes no history, which is what should happen.
      if (!lead || lead.companyId !== companyId) continue;
      if (lead.stageId === stageId) continue;
      setLeadStage(db, id, stageId);
      moved += 1;
    }
    return moved;
  })();
}

/** Deletes every selected lead. Returns how many were actually there. */
export function deleteMany(db: Db, companyId: string, ids: string[]): number {
  if (ids.length === 0) return 0;

  return db.transaction(() => {
    let removed = 0;
    for (const id of ids) {
      const result = db
        .prepare(`DELETE FROM leads WHERE id = ? AND company_id = ?`)
        .run(id, companyId);
      removed += result.changes;
    }
    return removed;
  })();
}

/* ---- Timeline ---------------------------------------------------------- */

export function listActivities(db: Db, leadId: string): Activity[] {
  const rows = db
    .prepare(
      // rowid breaks the tie. Timestamps are only millisecond-resolution, and
      // entries written in one transaction - creating a lead, or an edit that
      // moves the stage and changes a field - routinely share a millisecond.
      // Without this the timeline shows them in an arbitrary order, which
      // reads as the app getting the story wrong.
      `SELECT * FROM activities WHERE lead_id = ?
       ORDER BY occurred_at DESC, created_at DESC, rowid DESC`,
    )
    .all(leadId) as ActivityRow[];
  return rows.map(toActivity);
}

/**
 * Records something the user did. A call or a meeting also moves the
 * last-contacted date, which is what the going-cold list reads; a note does
 * not, because writing something down is not contact.
 */
export function logActivity(db: Db, input: ActivityInput): Activity {
  const lead = findLead(db, input.leadId);
  if (!lead) throw new Error("That lead no longer exists.");

  const now = new Date().toISOString();

  const id = db.transaction(() => {
    const activityId = writeActivity(db, {
      companyId: lead.companyId,
      leadId: input.leadId,
      kind: input.kind,
      body: input.body,
      occurredAt: now,
    });

    if (countsAsContact(input.kind)) {
      db.prepare(
        `UPDATE leads SET last_contacted_at = ?, updated_at = ? WHERE id = ?`,
      ).run(now, now, input.leadId);
    }
    return activityId;
  })();

  const row = db.prepare(`SELECT * FROM activities WHERE id = ?`).get(id) as ActivityRow;
  return toActivity(row);
}

/**
 * The single write path for the timeline, so nothing writes it by hand.
 * Used by the task repository to record a completion, and later by the email
 * bridge.
 */
export function writeActivity(
  db: Db,
  entry: {
    companyId: string;
    leadId: string;
    kind: ActivityKind;
    body: string | null;
    occurredAt: string;
    /**
     * Structured detail the timeline does not show but something else needs.
     *
     * A stage change puts the stage ID here. `body` carries the NAME, because
     * that is what the history has to read like years later - but a name is
     * not an identity, and the forecast reconstructs which stages a lead
     * passed through. Matching on a name that has since been edited would
     * quietly attribute a lead's history to the wrong part of the funnel.
     */
    meta?: Record<string, unknown>;
  },
): string {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO activities (id, company_id, lead_id, kind, body, occurred_at, created_at, meta)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    entry.companyId,
    entry.leadId,
    entry.kind,
    entry.body,
    entry.occurredAt,
    new Date().toISOString(),
    entry.meta ? JSON.stringify(entry.meta) : null,
  );
  return id;
}
