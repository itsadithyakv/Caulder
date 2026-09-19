import {
  createCipheriv,
  createDecipheriv,
  createPrivateKey,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync,
  randomBytes,
  scryptSync,
  type KeyObject,
} from "node:crypto";
import type { Db } from "../db/connection";
import { ENTRY_TEMPLATE } from "@shared/brain";
import { today as todayIn } from "@shared/dates";
import type { JournalLockState } from "@shared/life";
import { getSetting, setSetting } from "../repositories/settings";

/**
 * The journal's passcode (PLAN.md, after 0.3): writing needs none, reading
 * a day that is over does.
 *
 * Two keys make that possible. Setting a passcode makes a pair: the public
 * half is kept as it is and seals text, and needs nothing to do it; the
 * private half, the only thing that opens what was sealed, is kept encrypted
 * with a key made from the passcode. So a day that has ended is sealed
 * without asking - today's entry stays open to write in until midnight - and
 * reading one back means the passcode, once, until it locks again.
 *
 * Sealed means the words are nowhere else: the page's text, every earlier
 * version of it and the search index are emptied, and the words live only
 * as ciphertext in journal_sealed. The mood stays, so the calendar keeps its
 * faces. Forget the passcode and nobody can read those days - not Caulder,
 * not you - which the screen says before one is set.
 */

type LockRecord = { v: 1; publicKey: string; salt: string; iv: string; tag: string; box: string };
type SealedBox = { v: 1; eph: string; iv: string; tag: string; data: string };

/** Unlocked stays unlocked this long without being used, then locks itself. */
const IDLE_MS = 15 * 60 * 1000;
const MIN_LENGTH = 4;

let open: { key: KeyObject; at: number } | null = null;

const b64 = (bytes: Buffer) => bytes.toString("base64");
const unb64 = (text: string) => Buffer.from(text, "base64");

function lockRecord(db: Db): LockRecord | null {
  const raw = getSetting(db, "journalLock");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as LockRecord;
    return parsed.v === 1 ? parsed : null;
  } catch {
    return null;
  }
}

/** A key from the passcode: slow on purpose, so guessing it is slow too. */
function passKey(passcode: string, salt: Buffer): Buffer {
  return scryptSync(passcode.normalize("NFC"), salt, 32, { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
}

function checkedPasscode(value: unknown): string {
  if (typeof value !== "string" || value.length < MIN_LENGTH) {
    throw new Error(`A passcode needs at least ${MIN_LENGTH} characters.`);
  }
  if (value.length > 200) throw new Error("That passcode is too long.");
  return value;
}

function wrapPrivate(privateKey: KeyObject, passcode: string, publicKey: KeyObject): LockRecord {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", passKey(passcode, salt), iv);
  const box = Buffer.concat([cipher.update(privateKey.export({ type: "pkcs8", format: "der" })), cipher.final()]);
  return {
    v: 1,
    publicKey: b64(publicKey.export({ type: "spki", format: "der" })),
    salt: b64(salt),
    iv: b64(iv),
    tag: b64(cipher.getAuthTag()),
    box: b64(box),
  };
}

function unwrapPrivate(record: LockRecord, passcode: string): KeyObject {
  try {
    const decipher = createDecipheriv("aes-256-gcm", passKey(passcode, unb64(record.salt)), unb64(record.iv));
    decipher.setAuthTag(unb64(record.tag));
    const der = Buffer.concat([decipher.update(unb64(record.box)), decipher.final()]);
    return createPrivateKey({ key: der, format: "der", type: "pkcs8" });
  } catch {
    throw new Error("That is not the passcode.");
  }
}

/** A key for one sealed box, from a throwaway key pair and the journal's own. */
function boxKey(shared: Buffer, eph: Buffer): Buffer {
  return Buffer.from(hkdfSync("sha256", shared, eph, "caulder-journal-v1", 32));
}

function sealText(record: LockRecord, text: string): SealedBox {
  const recipient = createPublicKey({ key: unb64(record.publicKey), format: "der", type: "spki" });
  const ephemeral = generateKeyPairSync("x25519");
  const eph = ephemeral.publicKey.export({ type: "spki", format: "der" });
  const key = boxKey(diffieHellman({ privateKey: ephemeral.privateKey, publicKey: recipient }), eph);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return { v: 1, eph: b64(eph), iv: b64(iv), tag: b64(cipher.getAuthTag()), data: b64(data) };
}

function openText(privateKey: KeyObject, box: SealedBox): string {
  const eph = unb64(box.eph);
  const sender = createPublicKey({ key: eph, format: "der", type: "spki" });
  const key = boxKey(diffieHellman({ privateKey, publicKey: sender }), eph);
  const decipher = createDecipheriv("aes-256-gcm", key, unb64(box.iv));
  decipher.setAuthTag(unb64(box.tag));
  return Buffer.concat([decipher.update(unb64(box.data)), decipher.final()]).toString("utf8");
}

/** The private key, if the journal is unlocked and has been used recently. */
function openKey(now = Date.now()): KeyObject | null {
  if (!open) return null;
  if (now - open.at > IDLE_MS) {
    open = null;
    return null;
  }
  open.at = now;
  return open.key;
}

export function lockState(db: Db): JournalLockState {
  const set = lockRecord(db) !== null;
  return { set, open: set && openKey() !== null };
}

/* ---- Sealing ------------------------------------------------------------- */

type EntryRow = { id: string; body: string; day: string | null; sealed: number };

function entryRows(db: Db, companyId: string): EntryRow[] {
  return db
    .prepare(
      `SELECT p.id, p.body, json_extract(p.fields, '$.day') AS day,
              (SELECT COUNT(*) FROM journal_sealed s WHERE s.page_id = p.id) AS sealed
         FROM brain_pages p WHERE p.company_id = ? AND p.template = ?`,
    )
    .all(companyId, ENTRY_TEMPLATE) as EntryRow[];
}

/** Seals one entry's words, now, and takes them out of everywhere else. */
function sealEntry(db: Db, record: LockRecord, pageId: string, body: string, now: Date): void {
  db.transaction(() => {
    db.prepare(
      `INSERT INTO journal_sealed (page_id, box, sealed_at) VALUES (?, ?, ?)
       ON CONFLICT (page_id) DO UPDATE SET box = excluded.box, sealed_at = excluded.sealed_at`,
    ).run(pageId, JSON.stringify(sealText(record, body)), now.toISOString());
    // The page's text and every earlier version: the index follows the page.
    db.prepare(`UPDATE brain_pages SET body = '' WHERE id = ?`).run(pageId);
    db.prepare(`UPDATE brain_revisions SET body = '' WHERE page_id = ?`).run(pageId);
  })();
}

/**
 * Seals every entry for a day that is over and is not sealed yet, or was
 * written in again while unlocked. Called whenever the journal is read, so
 * yesterday is sealed by the first look today. Nothing happens without a passcode.
 */
export function sealPast(db: Db, companyId: string, now: Date = new Date()): void {
  const record = lockRecord(db);
  if (!record) return;
  const tz = (db.prepare(`SELECT timezone FROM companies WHERE id = ?`).get(companyId) as { timezone: string } | undefined)?.timezone;
  if (!tz) return;
  const today = todayIn(tz, now);
  for (const row of entryRows(db, companyId)) {
    if (!row.day || row.day >= today) continue;
    if (row.sealed > 0 && row.body === "") continue;
    sealEntry(db, record, row.id, row.body, now);
  }
}

/** After a save: an entry for a day that is over goes straight back under the seal. */
export function resealIfPast(db: Db, pageId: string, now: Date = new Date()): void {
  const row = db.prepare(`SELECT company_id, template FROM brain_pages WHERE id = ?`).get(pageId) as
    | { company_id: string; template: string }
    | undefined;
  if (row?.template === ENTRY_TEMPLATE) sealPast(db, row.company_id, now);
}

/**
 * The words of an entry as they can be read now: its own text when it is not
 * sealed, the opened box when the journal is unlocked, and nothing - locked -
 * when it is not.
 */
export function readableBody(db: Db, pageId: string, stored: string): { body: string; locked: boolean } {
  const row = db.prepare(`SELECT box FROM journal_sealed WHERE page_id = ?`).get(pageId) as { box: string } | undefined;
  if (!row || stored !== "") return { body: stored, locked: false };
  const key = openKey();
  if (!key) return { body: "", locked: true };
  try {
    return { body: openText(key, JSON.parse(row.box) as SealedBox), locked: false };
  } catch {
    return { body: "", locked: true };
  }
}

export function isSealed(db: Db, pageId: string): boolean {
  return db.prepare(`SELECT 1 FROM journal_sealed WHERE page_id = ?`).get(pageId) !== undefined;
}

/* ---- The passcode --------------------------------------------------------- */

export function setPasscode(db: Db, companyId: string, rawPasscode: unknown, now: Date = new Date()): JournalLockState {
  if (lockRecord(db)) throw new Error("The journal already has a passcode. Change it instead.");
  const passcode = checkedPasscode(rawPasscode);
  const pair = generateKeyPairSync("x25519");
  setSetting(db, "journalLock", JSON.stringify(wrapPrivate(pair.privateKey, passcode, pair.publicKey)));
  // Just set: open for now, so the person who set it is not locked out mid-thought.
  open = { key: pair.privateKey, at: Date.now() };
  sealPast(db, companyId, now);
  return lockState(db);
}

export function unlock(db: Db, rawPasscode: unknown): JournalLockState {
  const record = lockRecord(db);
  if (!record) return lockState(db);
  open = { key: unwrapPrivate(record, checkedPasscode(rawPasscode)), at: Date.now() };
  return lockState(db);
}

export function lockNow(db: Db): JournalLockState {
  open = null;
  return lockState(db);
}

/** A new passcode for the same key: nothing has to be sealed again. */
export function changePasscode(db: Db, oldPasscode: unknown, newPasscode: unknown): JournalLockState {
  const record = lockRecord(db);
  if (!record) throw new Error("The journal has no passcode to change.");
  const privateKey = unwrapPrivate(record, checkedPasscode(oldPasscode));
  const publicKey = createPublicKey(privateKey);
  setSetting(db, "journalLock", JSON.stringify(wrapPrivate(privateKey, checkedPasscode(newPasscode), publicKey)));
  open = { key: privateKey, at: Date.now() };
  return lockState(db);
}

/** No passcode any more: every sealed day is opened and put back as it was. */
export function removePasscode(db: Db, rawPasscode: unknown): JournalLockState {
  const record = lockRecord(db);
  if (!record) return lockState(db);
  const privateKey = unwrapPrivate(record, checkedPasscode(rawPasscode));
  const rows = db.prepare(`SELECT page_id, box FROM journal_sealed`).all() as { page_id: string; box: string }[];
  db.transaction(() => {
    for (const row of rows) {
      const body = openText(privateKey, JSON.parse(row.box) as SealedBox);
      db.prepare(`UPDATE brain_pages SET body = ? WHERE id = ? AND body = ''`).run(body, row.page_id);
    }
    db.prepare(`DELETE FROM journal_sealed`).run();
    setSetting(db, "journalLock", "");
  })();
  open = null;
  return lockState(db);
}

/**
 * The passcode is gone for good: the lock comes off and what it sealed goes
 * with it. The days, their moods and whatever is still being written today stay.
 */
export function forgetPasscode(db: Db): JournalLockState {
  db.transaction(() => {
    db.prepare(`DELETE FROM journal_sealed`).run();
    setSetting(db, "journalLock", "");
  })();
  open = null;
  return lockState(db);
}

/** For tests: the process-wide unlocked key, forgotten. */
export function resetForTests(): void {
  open = null;
}
