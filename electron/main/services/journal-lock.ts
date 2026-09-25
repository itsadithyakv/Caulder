import {
  createCipheriv,
  createDecipheriv,
  createPrivateKey,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync,
  randomBytes,
  randomInt,
  scryptSync,
  type KeyObject,
} from "node:crypto";
import type { Db } from "../db/connection";
import { ENTRY_TEMPLATE } from "@shared/brain";
import { addToEntry } from "@shared/capture";
import { today as todayIn } from "@shared/dates";
import type { JournalLockState, JournalRecovery } from "@shared/life";
import { MAX_PASSCODE, passcodeStrength } from "@shared/passcode";
import { getSetting, setSetting } from "../repositories/settings";

/**
 * The journal's passcode (PLAN.md, after 0.3): writing needs none, reading
 * a day that is over does.
 *
 * Two keys make that possible. Setting a passcode makes a pair: the public
 * half is kept as it is and seals text, and needs nothing to do it; the
 * private half, the only thing that opens what was sealed, is kept encrypted
 * with a key made from the passcode. So a day that has ended is sealed
 * without asking - and reading one back means the passcode, once, until it
 * locks again.
 *
 * Sealed means the words are nowhere else: the page's text, every earlier
 * version of it and the search index are emptied, and the words live only
 * as ciphertext in journal_sealed. The mood stays, so the calendar keeps its
 * faces.
 *
 * After 0.4.5 (PLAN.md, *The journal, locked properly*):
 *  - **Today can be locked as it is written** (`lockToday`), not at
 *    midnight. Writing still needs nothing: a line added while the journal is
 *    locked is sealed as a part of its own, and the parts are read together.
 *  - **A recovery key** opens the same private half, so a forgotten passcode
 *    need not mean the days are gone. It is shown once and kept nowhere.
 *  - **A slower key from the passcode** for passcodes set from now on, and
 *    new passcodes need some length. A passcode set before still opens.
 */

/** The private half, encrypted with a key made from a passcode or a recovery key. `n` is scrypt's cost, as a power of two. */
type Wrapped = { salt: string; iv: string; tag: string; box: string; n?: number };
type LockRecord = { v: 1; publicKey: string; recovery?: Wrapped } & Wrapped;
type SealedBox = { v: 1; eph: string; iv: string; tag: string; data: string };
/** An entry sealed in parts: written into while the journal was locked. Read in order, as one. */
type SealedParts = { v: 2; parts: SealedBox[] };

/** Unlocked stays unlocked this long without being used, then locks itself. */
const IDLE_MS = 15 * 60 * 1000;
/** What a passcode set before 0.4.5 was made with. */
const OLD_WORK = 15;
/** About a third of a second on a laptop: nothing to wait for once, a great deal to wait for a billion times. */
let work = 17;

/** Crockford's letters: no I, L, O or U, so a key read off paper is not misread. */
const RECOVERY_LETTERS = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const RECOVERY_LENGTH = 25;

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

/** A key from a passcode: slow on purpose, so guessing it is slow too. */
function passKey(secret: string, salt: Buffer, n: number): Buffer {
  return scryptSync(secret.normalize("NFC"), salt, 32, { N: 2 ** n, r: 8, p: 1, maxmem: 256 * 1024 * 1024 });
}

/** A passcode typed to open something: any it was ever set to. */
function givenPasscode(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) throw new Error("Type the passcode.");
  if (value.length > MAX_PASSCODE) throw new Error("That passcode is too long.");
  return value;
}

/** A passcode about to be set: held to `passcodeStrength`. */
function newPasscode(value: unknown): string {
  if (typeof value !== "string") throw new Error("Type a passcode.");
  if (value.length > MAX_PASSCODE) throw new Error("That passcode is too long.");
  const strength = passcodeStrength(value);
  if (!strength.ok) throw new Error(strength.hint ?? "Choose a longer passcode.");
  return value;
}

function wrap(privateKey: KeyObject, secret: string): Wrapped {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", passKey(secret, salt, work), iv);
  const box = Buffer.concat([cipher.update(privateKey.export({ type: "pkcs8", format: "der" })), cipher.final()]);
  return { salt: b64(salt), iv: b64(iv), tag: b64(cipher.getAuthTag()), box: b64(box), n: work };
}

function unwrap(wrapped: Wrapped, secret: string, wrong: string): KeyObject {
  try {
    const decipher = createDecipheriv("aes-256-gcm", passKey(secret, unb64(wrapped.salt), wrapped.n ?? OLD_WORK), unb64(wrapped.iv));
    decipher.setAuthTag(unb64(wrapped.tag));
    const der = Buffer.concat([decipher.update(unb64(wrapped.box)), decipher.final()]);
    return createPrivateKey({ key: der, format: "der", type: "pkcs8" });
  } catch {
    throw new Error(wrong);
  }
}

function lockWith(privateKey: KeyObject, passcode: string, recovery: Wrapped | undefined): LockRecord {
  const publicKey = createPublicKey(privateKey);
  return {
    v: 1,
    publicKey: b64(publicKey.export({ type: "spki", format: "der" })),
    ...wrap(privateKey, passcode),
    ...(recovery ? { recovery } : {}),
  };
}

const unwrapPasscode = (record: LockRecord, passcode: string) => unwrap(record, passcode, "That is not the passcode.");

/* ---- The recovery key ------------------------------------------------------ */

function makeRecoverySecret(): string {
  const letters = Array.from({ length: RECOVERY_LENGTH }, () => RECOVERY_LETTERS[randomInt(RECOVERY_LETTERS.length)]).join("");
  return letters.match(/.{5}/g)?.join("-") ?? letters;
}

/**
 * A recovery key as typed: any case, any spacing or dashes, and the letters
 * people misread for the digits they look like.
 */
export function recoveryOf(value: unknown): string {
  if (typeof value !== "string") throw new Error("Type the recovery key.");
  const letters = value
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
  if (letters.length !== RECOVERY_LENGTH) throw new Error(`A recovery key is ${RECOVERY_LENGTH} letters and numbers.`);
  return letters.match(/.{5}/g)?.join("-") ?? letters;
}

/* ---- Sealing a text ---------------------------------------------------------- */

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

function partsOf(stored: string): SealedBox[] {
  const parsed = JSON.parse(stored) as SealedBox | SealedParts;
  return parsed.v === 2 ? parsed.parts : [parsed];
}

/**
 * An entry's sealed words, every part, as one text. A part added later goes
 * where a line added to an open entry would (`addToEntry`), so Guided finds
 * it under Today, not under Tomorrow.
 */
function openEntry(privateKey: KeyObject, stored: string): string {
  const [first = "", ...added] = partsOf(stored).map((part) => openText(privateKey, part));
  return added.filter((text) => text.trim().length > 0).reduce((body, line) => addToEntry(body, line), first);
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
  const record = lockRecord(db);
  const set = record !== null;
  return {
    set,
    open: set && openKey() !== null,
    recovery: record?.recovery !== undefined,
    lockToday: set && getSetting(db, "journalLockToday") === "on",
  };
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

/**
 * Seals one entry's words, now, and takes them out of everywhere else. The
 * body is the whole of the entry - the editor saves what it opened, parts and
 * all - so it replaces whatever was sealed before.
 */
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
 * The words were on the page, briefly, before they were sealed. Deleted
 * content is overwritten as it goes (`secure_delete`, in `db/connection.ts`),
 * and folding the write-ahead log back into the file clears the copies it
 * held. A no-op for a database in memory.
 */
function scrub(db: Db): void {
  try {
    db.pragma("wal_checkpoint(TRUNCATE)");
  } catch {
    // Busy: the next one will do it.
  }
}

function todayOf(db: Db, companyId: string, now: Date): string | null {
  const tz = (db.prepare(`SELECT timezone FROM companies WHERE id = ?`).get(companyId) as { timezone: string } | undefined)?.timezone;
  return tz ? todayIn(tz, now) : null;
}

/**
 * Seals every entry that should be and is not yet, or was written in again
 * while unlocked: the days that are over, and today too when the journal
 * locks as it is written. Called whenever the journal is read and after every
 * save, so yesterday is sealed by the first look today. Nothing happens
 * without a passcode.
 */
export function sealPast(db: Db, companyId: string, now: Date = new Date()): void {
  const record = lockRecord(db);
  if (!record) return;
  const today = todayOf(db, companyId, now);
  if (!today) return;
  const lockToday = getSetting(db, "journalLockToday") === "on";
  let sealed = false;
  for (const row of entryRows(db, companyId)) {
    if (!row.day || row.day > today || (row.day === today && !lockToday)) continue;
    if (row.sealed > 0 && row.body === "") continue;
    sealEntry(db, record, row.id, row.body, now);
    sealed = true;
  }
  if (sealed) scrub(db);
}

/** After a save: an entry that should be sealed goes straight back under the seal. */
export function resealIfPast(db: Db, pageId: string, now: Date = new Date()): void {
  const row = db.prepare(`SELECT company_id, template FROM brain_pages WHERE id = ?`).get(pageId) as
    | { company_id: string; template: string }
    | undefined;
  if (row?.template === ENTRY_TEMPLATE) sealPast(db, row.company_id, now);
}

/** Whether an entry's words are sealed right now, so adding to them means adding a part. */
export function isSealedEmpty(db: Db, pageId: string): boolean {
  const row = db
    .prepare(`SELECT p.body FROM brain_pages p JOIN journal_sealed s ON s.page_id = p.id WHERE p.id = ?`)
    .get(pageId) as { body: string } | undefined;
  return row !== undefined && row.body === "";
}

/**
 * Words added to a sealed entry - a line from Today, a note moved into its
 * day - without the passcode: sealed as a part of their own, after the rest.
 * Opening the entry reads the parts together; saving it opened makes them one.
 */
export function addSealedPart(db: Db, pageId: string, words: string, now: Date = new Date()): void {
  const record = lockRecord(db);
  if (!record) throw new Error("The journal has no passcode to seal with.");
  const row = db.prepare(`SELECT box FROM journal_sealed WHERE page_id = ?`).get(pageId) as { box: string } | undefined;
  const parts = [...(row ? partsOf(row.box) : []), sealText(record, words)];
  const stored: SealedParts = { v: 2, parts };
  db.prepare(
    `INSERT INTO journal_sealed (page_id, box, sealed_at) VALUES (?, ?, ?)
     ON CONFLICT (page_id) DO UPDATE SET box = excluded.box, sealed_at = excluded.sealed_at`,
  ).run(pageId, JSON.stringify(stored), now.toISOString());
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
    return { body: openEntry(key, row.box), locked: false };
  } catch {
    return { body: "", locked: true };
  }
}

export function isSealed(db: Db, pageId: string): boolean {
  return db.prepare(`SELECT 1 FROM journal_sealed WHERE page_id = ?`).get(pageId) !== undefined;
}

/* ---- The passcode --------------------------------------------------------- */

/** A passcode, set: the journal's key pair is made, and a recovery key with it, shown this once. */
export function setPasscode(db: Db, companyId: string, rawPasscode: unknown, now: Date = new Date()): JournalRecovery {
  if (lockRecord(db)) throw new Error("The journal already has a passcode. Change it instead.");
  const passcode = newPasscode(rawPasscode);
  const pair = generateKeyPairSync("x25519");
  const recoveryKey = makeRecoverySecret();
  setSetting(db, "journalLock", JSON.stringify(lockWith(pair.privateKey, passcode, wrap(pair.privateKey, recoveryKey))));
  // Just set: open for now, so the person who set it is not locked out mid-thought.
  open = { key: pair.privateKey, at: Date.now() };
  sealPast(db, companyId, now);
  sealPrivateLines(db);
  return { state: lockState(db), recoveryKey };
}

export function unlock(db: Db, rawPasscode: unknown): JournalLockState {
  const record = lockRecord(db);
  if (!record) return lockState(db);
  open = { key: unwrapPasscode(record, givenPasscode(rawPasscode)), at: Date.now() };
  return lockState(db);
}

/**
 * The passcode, asked for again although the journal may be open: what
 * sending the journal anywhere takes, so it is a decision and not a click.
 */
export function checkPasscode(db: Db, rawPasscode: unknown): void {
  const record = lockRecord(db);
  if (!record) throw new Error("The journal has no passcode.");
  unwrapPasscode(record, givenPasscode(rawPasscode));
}

export function lockNow(db: Db): JournalLockState {
  open = null;
  return lockState(db);
}

/** A new passcode for the same key: nothing has to be sealed again, and the recovery key still works. */
export function changePasscode(db: Db, oldPasscode: unknown, rawNew: unknown): JournalLockState {
  const record = lockRecord(db);
  if (!record) throw new Error("The journal has no passcode to change.");
  const privateKey = unwrapPasscode(record, givenPasscode(oldPasscode));
  setSetting(db, "journalLock", JSON.stringify(lockWith(privateKey, newPasscode(rawNew), record.recovery)));
  open = { key: privateKey, at: Date.now() };
  return lockState(db);
}

/**
 * A recovery key, new: for a journal locked before there were any, or to
 * replace one that was lost. The journal has to be open; any earlier key
 * stops working.
 */
export function makeRecoveryKey(db: Db): JournalRecovery {
  const record = lockRecord(db);
  if (!record) throw new Error("Set a passcode first.");
  const privateKey = openKey();
  if (!privateKey) throw new Error("Unlock the journal first.");
  const recoveryKey = makeRecoverySecret();
  setSetting(db, "journalLock", JSON.stringify({ ...record, recovery: wrap(privateKey, recoveryKey) }));
  return { state: lockState(db), recoveryKey };
}

/** The passcode is forgotten but the recovery key is not: a new passcode, and every day still there. */
export function recoverWith(db: Db, rawKey: unknown, rawNew: unknown): JournalLockState {
  const record = lockRecord(db);
  if (!record) throw new Error("The journal has no passcode.");
  if (!record.recovery) throw new Error("This journal has no recovery key.");
  const privateKey = unwrap(record.recovery, recoveryOf(rawKey), "That is not the recovery key.");
  setSetting(db, "journalLock", JSON.stringify(lockWith(privateKey, newPasscode(rawNew), record.recovery)));
  open = { key: privateKey, at: Date.now() };
  return lockState(db);
}

/**
 * Whether today is locked as it is written. On, today is sealed at the next
 * save; off takes the journal open, because today's words come out of their
 * box and back onto the page.
 */
export function setLockToday(db: Db, companyId: string, on: unknown, now: Date = new Date()): JournalLockState {
  const record = lockRecord(db);
  if (!record) throw new Error("Set a passcode first.");
  if (on === true) {
    setSetting(db, "journalLockToday", "on");
    sealPast(db, companyId, now);
    return lockState(db);
  }
  const privateKey = openKey();
  if (!privateKey) throw new Error("Unlock the journal to leave today open.");
  const today = todayOf(db, companyId, now);
  db.transaction(() => {
    for (const row of entryRows(db, companyId)) {
      if (row.day !== today || row.sealed === 0) continue;
      const box = db.prepare(`SELECT box FROM journal_sealed WHERE page_id = ?`).get(row.id) as { box: string };
      db.prepare(`UPDATE brain_pages SET body = ? WHERE id = ? AND body = ''`).run(openEntry(privateKey, box.box), row.id);
      db.prepare(`DELETE FROM journal_sealed WHERE page_id = ?`).run(row.id);
    }
    setSetting(db, "journalLockToday", "");
  })();
  return lockState(db);
}

/** No passcode any more: every sealed day is opened and put back as it was. */
export function removePasscode(db: Db, rawPasscode: unknown): JournalLockState {
  const record = lockRecord(db);
  if (!record) return lockState(db);
  const privateKey = unwrapPasscode(record, givenPasscode(rawPasscode));
  const rows = db.prepare(`SELECT page_id, box FROM journal_sealed`).all() as { page_id: string; box: string }[];
  db.transaction(() => {
    for (const row of rows) {
      db.prepare(`UPDATE brain_pages SET body = ? WHERE id = ? AND body = ''`).run(openEntry(privateKey, row.box), row.page_id);
    }
    db.prepare(`DELETE FROM journal_sealed`).run();
    // Private lines come out of their boxes too: no lock means nothing is sealed.
    const lines = db.prepare(`SELECT id, box FROM journal_private WHERE box IS NOT NULL`).all() as { id: string; box: string }[];
    for (const line of lines) {
      db.prepare(`UPDATE journal_private SET body = ?, box = NULL WHERE id = ?`).run(
        openText(privateKey, JSON.parse(line.box) as SealedBox),
        line.id,
      );
    }
    setSetting(db, "journalLock", "");
    setSetting(db, "journalLockToday", "");
  })();
  open = null;
  return lockState(db);
}

/**
 * The passcode is gone for good, and so is the recovery key: the lock comes
 * off and what it sealed goes with it. The days, their moods and whatever is
 * still being written today stay.
 */
export function forgetPasscode(db: Db): JournalLockState {
  db.transaction(() => {
    db.prepare(`DELETE FROM journal_sealed`).run();
    // Sealed private lines cannot be opened by anybody now, so they go as the sealed days do.
    db.prepare(`DELETE FROM journal_private WHERE box IS NOT NULL`).run();
    setSetting(db, "journalLock", "");
    setSetting(db, "journalLockToday", "");
  })();
  open = null;
  scrub(db);
  return lockState(db);
}

/* ---- Private lines ------------------------------------------------------- */

/**
 * A private line, as it is stored: sealed at once when there is a passcode to
 * seal with - which takes no passcode, only the public half of the key - and
 * as it is when there is not. Says which, so the screen can.
 */
export function keepPrivate(text: string, db: Db): { box: string | null; body: string | null } {
  const record = lockRecord(db);
  return record ? { box: JSON.stringify(sealText(record, text)), body: null } : { box: null, body: text };
}

/** A private line read back: null while the journal is locked. */
export function readPrivateBox(box: string): string | null {
  const key = openKey();
  return key ? openText(key, JSON.parse(box) as SealedBox) : null;
}

/** A passcode has just been set: every private line written before it is sealed there and then. */
function sealPrivateLines(db: Db): void {
  const record = lockRecord(db);
  if (!record) return;
  const lines = db.prepare(`SELECT id, body FROM journal_private WHERE body IS NOT NULL`).all() as { id: string; body: string }[];
  db.transaction(() => {
    for (const line of lines) {
      db.prepare(`UPDATE journal_private SET box = ?, body = NULL WHERE id = ?`).run(JSON.stringify(sealText(record, line.body)), line.id);
    }
  })();
  if (lines.length > 0) scrub(db);
}

/** For tests: the process-wide unlocked key forgotten, and a quick key from the passcode so the suite stays quick. */
export function resetForTests(): void {
  open = null;
  work = 10;
}
