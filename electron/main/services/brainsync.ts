import type { Db } from "../db/connection";
import { PERSONAL_SQL, isPersonalSection, isSection, templateOf, type FieldValue } from "@shared/brain";
import type { ShareState } from "@shared/share";
import {
  applyArrivedEdit,
  deletePage,
  insertArrivedPage,
  keepBothVersions,
  markEditedTogether,
  travellingOf,
  type TravellingPage,
} from "../repositories/brain";
import { readMe } from "../repositories/me";
import { callScript } from "./gsync";
import { readBrainConnection, readConnection, saveBrainConnection, type BrainConnection } from "./credentials";
import { logProblem } from "../log";

/**
 * The shared brain: two founders' Caulders kept in step through the Google
 * script, with no server of Caulder's own. See PLAN.md, phase 12.
 *
 * The script keeps a log - every change to a page a row, numbered by page -
 * and each Caulder reads the log from where it last got to, then sends what
 * has changed here. The rules, in the order they are applied:
 *
 *  - A change from the other side, to a page not changed here, becomes the
 *    page.
 *  - A change from the other side, to a page that HAS changed here, is kept
 *    in the page's history, and this side's version is written on top of it;
 *    both are marked as edited at the same time, and the page says so. When
 *    this side's goes up, the script marks it too. Nothing is overwritten
 *    without a trace; which words to keep is the founders' call.
 *  - An edit beats a delete, whichever side made which.
 *  - Secrets never travel, and neither does a pin: each founder pins their own.
 */

/** A request to the script about one shared brain. Tests pass their own. */
export type Transport = <T>(action: string, payload: Record<string, unknown>) => Promise<T>;

type Change = {
  pageId: string;
  revision: number;
  author: string;
  authorId: string;
  editedAt: string;
  concurrentWith: number | null;
  deleted: boolean;
  payload: string;
};

type CompanyRow = {
  id: string;
  name: string;
  brain_key: string | null;
  brain_name: string | null;
  brain_role: "owner" | "member" | null;
  brain_cursor: number;
  brain_synced_at: string | null;
  brain_error: string | null;
};

/** Pages pushed in one request: well under the script's own limit, and a request Google answers in time. */
const PUSH_BATCH = 40;
/** A pull that keeps saying "more" this often is a loop, not a big brain. */
const PULL_ROUNDS = 200;

function companyRow(db: Db, companyId: string): CompanyRow {
  const row = db
    .prepare(
      `SELECT id, name, brain_key, brain_name, brain_role, brain_cursor, brain_synced_at, brain_error
         FROM companies WHERE id = ?`,
    )
    .get(companyId) as CompanyRow | undefined;
  if (!row) throw new Error("That company no longer exists.");
  return row;
}

function throughConnection(connection: BrainConnection): Transport {
  return <T>(action: string, payload: Record<string, unknown>) => callScript<T>(action, payload, connection);
}

/** How this company's brain is reached, or why it cannot be. */
function transportOf(companyId: string): Transport {
  const connection = readBrainConnection(companyId);
  if (!connection) throw new Error("This Caulder no longer has the shared brain's address. Stop sharing and join again.");
  return throughConnection(connection);
}

export function shareState(db: Db, companyId: string): ShareState {
  const company = companyRow(db, companyId);
  const waiting = company.brain_key
    ? (
        db
          .prepare(
            `SELECT (SELECT COUNT(*) FROM brain_pages
                      WHERE company_id = ? AND sync_dirty = 1 AND section NOT IN (${PERSONAL_SQL}))
                  + (SELECT COUNT(*) FROM brain_tombstones WHERE company_id = ?) AS n`,
          )
          .get(companyId, companyId) as { n: number }
      ).n
    : 0;
  let googleConnected = false;
  try {
    googleConnected = readConnection() !== null;
  } catch {
    googleConnected = false;
  }
  return {
    me: readMe(db).name,
    googleConnected,
    shared: company.brain_key
      ? {
          name: company.brain_name ?? "Shared brain",
          role: company.brain_role ?? "member",
          lastSyncedAt: company.brain_synced_at,
          error: company.brain_error,
          waiting,
        }
      : null,
  };
}

function requireMe(db: Db): { id: string; name: string } {
  const me = readMe(db);
  if (!me.name) throw new Error("Say who you are first, under This is me in Settings: every change you share carries it.");
  return { id: me.id, name: me.name };
}

/** Everything in the company goes up on the next sync: the shared brain starts from all of it. */
function sendEverything(db: Db, companyId: string): void {
  db.prepare(`UPDATE brain_pages SET sync_revision = NULL, sync_dirty = 1 WHERE company_id = ?`).run(companyId);
  db.prepare(`DELETE FROM brain_tombstones WHERE company_id = ?`).run(companyId);
}

/** The owner's side: the brain is made in their own script and filled from this company. */
export async function startSharing(db: Db, companyId: string, now: Date = new Date(), transport?: Transport): Promise<ShareState> {
  const me = requireMe(db);
  const company = companyRow(db, companyId);
  if (company.brain_key) throw new Error("This company's brain is already shared.");
  const own = transport ? null : readConnection();
  if (!transport && !own) throw new Error("Connect Google first, in Settings: the shared brain lives in your script.");
  const send = transport ?? throughConnection(own as BrainConnection);

  const made = await send<{ key: string; name: string }>("brainCreate", { name: company.name, author: me.name }).catch(
    (error: unknown) => {
      throw olderScript(error, "Your Google script is older than sharing. Paste the new version in and run setUp once more - Settings, under Google, has the steps.");
    },
  );
  if (!transport && own) saveBrainConnection(companyId, { url: own.url, secret: own.secret });
  db.transaction(() => {
    db.prepare(
      `UPDATE companies SET brain_key = ?, brain_name = ?, brain_role = 'owner', brain_cursor = 0,
         brain_synced_at = NULL, brain_error = NULL WHERE id = ?`,
    ).run(made.key, made.name, companyId);
    sendEverything(db, companyId);
  })();
  return syncBrain(db, companyId, now, transport);
}

/**
 * A script from before version 3 does not know the brain: say what to do about
 * it, not what it said. It answers an action it lacks with "does not do", and
 * an invitation - which it cannot read - as a wrong key.
 */
function olderScript(error: unknown, advice: string, signs: readonly string[] = ["does not do"]): Error {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(signs.some((sign) => message.includes(sign)) ? advice : message);
}

/** "https://script.google.com/…/exec#invitation", as the owner copies it. */
function readInvitation(text: unknown): BrainConnection {
  const value = typeof text === "string" ? text.trim() : "";
  const at = value.lastIndexOf("#");
  const url = at > 0 ? value.slice(0, at) : "";
  const invite = at > 0 ? value.slice(at + 1) : "";
  if (!/^https:\/\/\S+$/.test(url) || !/^[A-Za-z0-9]{16,}$/.test(invite)) {
    throw new Error("That is not an invitation. It is one line your co-founder copied from Caulder, starting https://.");
  }
  return { url, invite };
}

/** The owner's invitation to send the co-founder: the script's address and a key to this brain only. */
export async function invitationFor(db: Db, companyId: string, transport?: Transport): Promise<string> {
  const company = companyRow(db, companyId);
  if (!company.brain_key || company.brain_role !== "owner") throw new Error("Only the founder whose script it is can invite.");
  const connection = transport ? null : readBrainConnection(companyId);
  const { invite } = await (transport ?? transportOf(companyId))<{ invite: string }>("brainInvite", { key: company.brain_key });
  return `${connection?.url ?? ""}#${invite}`;
}

/** What an invitation opens, before joining it. */
export async function previewInvitation(
  text: unknown,
  transport?: Transport,
): Promise<{ name: string; createdBy: string; pages: number }> {
  const connection = readInvitation(text);
  return (transport ?? throughConnection(connection))("brainInfo", {});
}

/**
 * The co-founder's side: this company joins the brain the invitation opens.
 * What it already has goes up too, so two brains started apart become one.
 */
export async function joinBrain(
  db: Db,
  companyId: string,
  text: unknown,
  now: Date = new Date(),
  transport?: Transport,
): Promise<ShareState> {
  requireMe(db);
  const company = companyRow(db, companyId);
  if (company.brain_key) throw new Error("This company's brain is already shared. Stop sharing it first.");
  const connection = readInvitation(text);
  const send = transport ?? throughConnection(connection);
  const info = await send<{ key: string; name: string }>("brainInfo", {}).catch((error: unknown) => {
    throw olderScript(
      error,
      "Your co-founder's Google script is older than sharing. Ask them to paste in the new version and run setUp once more.",
      ["does not do", "key is not right"],
    );
  });
  if (!transport) saveBrainConnection(companyId, connection);
  db.transaction(() => {
    db.prepare(
      `UPDATE companies SET brain_key = ?, brain_name = ?, brain_role = 'member', brain_cursor = 0,
         brain_synced_at = NULL, brain_error = NULL WHERE id = ?`,
    ).run(info.key, info.name, companyId);
    sendEverything(db, companyId);
  })();
  return syncBrain(db, companyId, now, transport);
}

/**
 * Stops sharing here. The pages stay. For the owner it also cancels the
 * invitation, so the co-founder's Caulder can no longer reach the brain - and
 * if that fails, nothing changes, because "stopped" must mean stopped.
 */
export async function stopSharing(db: Db, companyId: string, transport?: Transport): Promise<ShareState> {
  const company = companyRow(db, companyId);
  if (!company.brain_key) return shareState(db, companyId);
  if (company.brain_role === "owner") {
    await (transport ?? transportOf(companyId))("brainClose", { key: company.brain_key });
  }
  db.transaction(() => {
    db.prepare(
      `UPDATE companies SET brain_key = NULL, brain_name = NULL, brain_role = NULL, brain_connection = NULL,
         brain_cursor = 0, brain_synced_at = NULL, brain_error = NULL WHERE id = ?`,
    ).run(companyId);
    db.prepare(`UPDATE brain_pages SET sync_revision = NULL, sync_dirty = 0 WHERE company_id = ?`).run(companyId);
    db.prepare(`DELETE FROM brain_tombstones WHERE company_id = ?`).run(companyId);
  })();
  return shareState(db, companyId);
}

/* ---- A page as it travels ------------------------------------------------ */

const MAX_TITLE = 160;
const MAX_BODY = 100_000;

function isFieldValue(value: unknown): value is FieldValue {
  return value === null || ["string", "number", "boolean"].includes(typeof value);
}

/** A page from the log or a file, checked like anything else that crosses into the database. Null if it is not one. */
export function readTravelling(raw: unknown): TravellingPage | null {
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (typeof value !== "object" || value === null) return null;
  const page = value as Record<string, unknown>;
  // The founder's own sections never travel, whichever side sent them.
  if (!isSection(page["section"]) || isPersonalSection(page["section"])) return null;
  if (typeof page["template"] !== "string" || !page["template"]) return null;
  if (typeof page["title"] !== "string" || !page["title"].trim() || page["title"].length > MAX_TITLE) return null;
  if (typeof page["body"] !== "string" || page["body"].length > MAX_BODY) return null;
  const rawFields = page["fields"];
  if (typeof rawFields !== "object" || rawFields === null || Array.isArray(rawFields)) return null;
  const fields: Record<string, FieldValue> = {};
  for (const [key, field] of Object.entries(rawFields as Record<string, unknown>)) {
    if (isFieldValue(field)) fields[key] = field;
  }
  return {
    section: page["section"],
    template: page["template"],
    title: page["title"],
    body: page["body"],
    fields,
    isArchived: page["isArchived"] === true,
  };
}

/**
 * A company has one page of some kinds - one profile, one cap table. When the
 * other side's arrives and this side already has its own, this side's steps
 * aside as a plain page, renamed, rather than one being lost.
 */
export function makeRoomForSingle(db: Db, companyId: string, template: string, arrivingId: string): void {
  if (!templateOf(template).single || templateOf(template).id !== template) return;
  const mine = db
    .prepare(`SELECT id FROM brain_pages WHERE company_id = ? AND template = ? AND id != ?`)
    .get(companyId, template, arrivingId) as { id: string } | undefined;
  if (mine) {
    db.prepare(`UPDATE brain_pages SET template = 'page', title = substr(title || ' (before sharing)', 1, 160) WHERE id = ?`).run(
      mine.id,
    );
  }
}

function isoOr(value: string, fallback: string): string {
  return /^\d{4}-\d{2}-\d{2}T/.test(value) && !Number.isNaN(Date.parse(value)) ? value : fallback;
}

/** One change from the log. Says whether anything here changed. */
function applyChange(db: Db, companyId: string, change: Change, now: string): boolean {
  const row = db
    .prepare(`SELECT id, company_id, sync_revision, sync_dirty FROM brain_pages WHERE id = ?`)
    .get(change.pageId) as { id: string; company_id: string; sync_revision: number | null; sync_dirty: number } | undefined;
  // The same page in another company here: two companies joined to one brain. Leave it.
  if (row && row.company_id !== companyId) return false;
  if (row && row.sync_revision !== null && change.revision <= row.sync_revision) return false;

  const arrival = {
    author: change.author || null,
    editedAt: isoOr(change.editedAt, now),
    concurrent: change.concurrentWith !== null,
    syncRevision: change.revision,
  };

  if (change.deleted) {
    if (!row) return false;
    // Changed here since: an edit beats a delete, and it goes back up.
    if (row.sync_dirty === 1) return false;
    db.prepare(`UPDATE brain_pages SET sync_revision = NULL WHERE id = ?`).run(row.id);
    deletePage(db, row.id);
    return true;
  }

  const page = readTravelling(change.payload);
  if (!page) {
    logProblem("brain sync", new Error(`An unreadable page came from the shared brain: ${change.pageId}`));
    return false;
  }

  if (!row) {
    // Deleted here, edited there: the edit wins, so the delete is not sent.
    db.prepare(`DELETE FROM brain_tombstones WHERE company_id = ? AND page_id = ?`).run(companyId, change.pageId);
    makeRoomForSingle(db, companyId, page.template, change.pageId);
    insertArrivedPage(db, companyId, change.pageId, page, arrival);
    return true;
  }
  if (row.sync_dirty === 0) {
    applyArrivedEdit(db, row.id, page, arrival);
    return true;
  }
  keepBothVersions(db, row.id, page, arrival, now);
  return true;
}

type PushResult = { pageId: string; revision: number; concurrent: boolean };

/**
 * Reads the log from where this company got to, then sends what changed
 * here. A failure is written on the company, where Brain shows it, and thrown.
 */
export async function syncBrain(
  db: Db,
  companyId: string,
  now: Date = new Date(),
  transport?: Transport,
): Promise<ShareState> {
  const company = companyRow(db, companyId);
  if (!company.brain_key) throw new Error("This company's brain is not shared.");
  const key = company.brain_key;
  const at = now.toISOString();

  try {
    const send = transport ?? transportOf(companyId);
    const me = requireMe(db);

    let cursor = company.brain_cursor;
    for (let round = 0; round < PULL_ROUNDS; round += 1) {
      const pulled = await send<{ changes: Change[]; cursor: number; more: boolean }>("brainPull", { key, since: cursor });
      db.transaction(() => {
        for (const change of pulled.changes) applyChange(db, companyId, change, at);
        db.prepare(`UPDATE companies SET brain_cursor = ? WHERE id = ?`).run(pulled.cursor, companyId);
      })();
      cursor = pulled.cursor;
      if (!pulled.more) break;
    }

    type Dirty = {
      id: string;
      section: TravellingPage["section"];
      template: string;
      title: string;
      body: string;
      fields: string;
      is_archived: number;
      revision: number;
      updated_at: string;
      sync_revision: number | null;
    };
    const dirty = db
      .prepare(
        `SELECT id, section, template, title, body, fields, is_archived, revision, updated_at, sync_revision
           FROM brain_pages WHERE company_id = ? AND sync_dirty = 1 AND section NOT IN (${PERSONAL_SQL})`,
      )
      .all(companyId) as Dirty[];
    const gone = db
      .prepare(`SELECT page_id, sync_revision FROM brain_tombstones WHERE company_id = ?`)
      .all(companyId) as { page_id: string; sync_revision: number | null }[];

    const changes = [
      ...dirty.map((page) => ({
        pageId: page.id,
        baseRevision: page.sync_revision ?? 0,
        deleted: false,
        payload: JSON.stringify(travellingOf(page)),
        editedAt: page.updated_at,
      })),
      ...gone.map((tomb) => ({ pageId: tomb.page_id, baseRevision: tomb.sync_revision ?? 0, deleted: true, payload: "", editedAt: at })),
    ];
    const snapshot = new Map(dirty.map((page) => [page.id, page]));
    const tombs = new Set(gone.map((tomb) => tomb.page_id));

    for (let start = 0; start < changes.length; start += PUSH_BATCH) {
      const batch = changes.slice(start, start + PUSH_BATCH);
      const { results } = await send<{ results: PushResult[] }>("brainPush", {
        key,
        author: me.name,
        authorId: me.id,
        changes: batch,
      });
      db.transaction(() => {
        for (const result of results) {
          if (tombs.has(result.pageId)) {
            db.prepare(`DELETE FROM brain_tombstones WHERE company_id = ? AND page_id = ?`).run(companyId, result.pageId);
            continue;
          }
          const sent = snapshot.get(result.pageId);
          if (!sent) continue;
          db.prepare(`UPDATE brain_pages SET sync_revision = ? WHERE id = ?`).run(result.revision, result.pageId);
          // Still marked if it changed again while it was on its way.
          db.prepare(`UPDATE brain_pages SET sync_dirty = 0 WHERE id = ? AND revision = ? AND updated_at = ?`).run(
            result.pageId,
            sent.revision,
            sent.updated_at,
          );
          if (result.concurrent) markEditedTogether(db, result.pageId);
        }
      })();
    }

    db.prepare(`UPDATE companies SET brain_synced_at = ?, brain_error = NULL WHERE id = ?`).run(at, companyId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    db.prepare(`UPDATE companies SET brain_error = ? WHERE id = ?`).run(message, companyId);
    throw error;
  }
  return shareState(db, companyId);
}
