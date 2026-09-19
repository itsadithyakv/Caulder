import { getDatabase } from "../db/connection";
import { getSetting } from "../repositories/settings";
import { isConnected } from "./credentials";
import { syncNow } from "./gsync";
import { syncBrain } from "./brainsync";
import { isFault, logProblem } from "../log";
import { hasEmailWork } from "../repositories/mail";
import { syncEmails } from "./mail";

/**
 * Keeping Google in step without being asked.
 *
 * The point of the whole link is that a task written here turns up on a phone.
 * A button that has to be pressed does not do that — you press it when you
 * remember, and remembering is the thing this is supposed to replace.
 *
 * The reason it was not built immediately is that an automatic sync needs an
 * answer to one question a manual one does not: **what happens when it fails
 * repeatedly while nobody is watching?** Without an answer, a revoked key or a
 * deleted deployment means hammering Google every ten minutes, forever, and a
 * stale calendar that still looks current. So:
 *
 *  - **One at a time.** Runs never overlap, however they were triggered.
 *  - **It backs off.** Each consecutive failure doubles the wait, up to an
 *    hour. Nothing is retried faster because something else asked for it.
 *  - **It gives up out loud.** After enough failures it stops trying and the
 *    error stays on the Settings card, where it is the user's move.
 *  - **A local change nudges it**, debounced, so writing a task reaches the
 *    phone in half a minute rather than at the next tick.
 *  - **It can be switched off**, and is off entirely while nothing is
 *    connected or mapped.
 */

/** The quiet cadence when everything is working. */
const EVERY_MS = 10 * 60 * 1000;

/**
 * How long a local change waits before it is sent.
 *
 * Long enough that renaming a task three times is one sync, short enough that
 * the phone has it before you have finished putting the phone down.
 */
const NUDGE_MS = 25_000;

/** The first backoff step, doubled per failure. */
const BACKOFF_MS = 60_000;
const BACKOFF_CAP_MS = 60 * 60 * 1000;

/**
 * Consecutive failures before it stops on its own.
 *
 * Six is roughly two hours of doubling. Past that the problem is not going to
 * clear itself - a key has been revoked, or a deployment deleted - and the
 * honest thing is to stop and leave the reason on the screen.
 */
const GIVE_UP_AFTER = 6;

let timer: NodeJS.Timeout | null = null;
let nudge: NodeJS.Timeout | null = null;
let running = false;
let failures = 0;
let stopped = false;

/** Off unless explicitly switched on, like every other thing that acts alone. */
export function autoSyncOn(): boolean {
  try {
    return getSetting(getDatabase(), "googleAuto") === "1";
  } catch (error) {
    // "Not open yet" is ordinary at launch; anything else is worth a line.
    if (isFault(error)) logProblem("sync", error);
    return false;
  }
}

/** Which workspaces have somewhere to sync to. */
function mapped(): string[] {
  try {
    const rows = getDatabase()
      .prepare(
        `SELECT id FROM companies
          WHERE is_archived = 0
            AND (google_calendar_id IS NOT NULL OR google_tasklist_id IS NOT NULL)`,
      )
      .all() as { id: string }[];
    return rows.map((row) => row.id);
  } catch (error) {
    if (isFault(error)) logProblem("sync", error);
    return [];
  }
}

/**
 * One pass over every mapped workspace.
 *
 * A failure in one does not stop the others: two workspaces are two accounts'
 * worth of independent work, and one broken mapping should not take the other
 * down with it.
 */
async function pass(): Promise<void> {
  if (running || stopped) return;
  if (!autoSyncOn() || !isConnected()) return;

  const companies = mapped();
  if (companies.length === 0) return;

  running = true;
  let failed = false;

  try {
    for (const companyId of companies) {
      try {
        await syncNow(getDatabase(), companyId);
      } catch {
        // syncNow has already written the reason where Settings will show it.
        failed = true;
      }
    }
  } finally {
    running = false;
  }

  if (failed) {
    failures += 1;
    if (failures >= GIVE_UP_AFTER) {
      stopped = true;
      return;
    }
    // Slower each time, so a broken connection is not retried at the same
    // rate as a working one is kept fresh.
    schedule(Math.min(BACKOFF_CAP_MS, BACKOFF_MS * 2 ** (failures - 1)));
    return;
  }

  failures = 0;
  schedule(EVERY_MS);
}

function schedule(delay: number): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void pass(), delay);
}

/**
 * Starts, or restarts after something changed.
 *
 * Called on launch and whenever the connection or a mapping is edited, so
 * turning it on takes effect now rather than in ten minutes. Restarting also
 * clears the give-up state, because a person changing the settings is a person
 * who has probably just fixed the problem.
 */
export function startSyncing(): void {
  stopSyncing();
  stopped = false;
  failures = 0;
  if (!autoSyncOn()) return;

  // Not immediately. The window has just opened and the first thing anybody
  // wants is the app, not a network call competing with it.
  schedule(15_000);
}

export function stopSyncing(): void {
  if (timer) clearTimeout(timer);
  if (nudge) clearTimeout(nudge);
  timer = null;
  nudge = null;
}

/**
 * Something changed here, so send it soon.
 *
 * Debounced rather than immediate: a burst of edits is one sync, and every
 * keystroke in a rename is not a round trip to Google.
 */
export function nudgeSync(): void {
  if (stopped || !autoSyncOn() || !isConnected()) return;
  if (nudge) clearTimeout(nudge);
  nudge = setTimeout(() => {
    nudge = null;
    void pass();
  }, NUDGE_MS);
}

/* ---- Email ---------------------------------------------------------------
 * Separate from the calendar sync and not behind its switch: somebody who has
 * sent an email from Caulder has asked to hear what became of it. It runs
 * only while there is something in play, and a repeated failure is written to
 * the log once rather than every ten minutes.
 * ------------------------------------------------------------------------ */

const MAIL_EVERY_MS = 10 * 60 * 1000;

let mailTimer: NodeJS.Timeout | null = null;
let lastMailProblem: string | null = null;

async function watchMail(): Promise<void> {
  try {
    const db = getDatabase();
    if (isConnected() && hasEmailWork(db)) {
      await syncEmails(db);
      lastMailProblem = null;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message !== lastMailProblem) logProblem("email", error);
    lastMailProblem = message;
  } finally {
    mailTimer = setTimeout(() => void watchMail(), MAIL_EVERY_MS);
  }
}

export function startMailWatch(): void {
  stopMailWatch();
  // Not at once: the window has just opened, and it comes first.
  mailTimer = setTimeout(() => void watchMail(), 30_000);
}

export function stopMailWatch(): void {
  if (mailTimer) clearTimeout(mailTimer);
  mailTimer = null;
}

/* ---- The shared brain ----------------------------------------------------- */

/**
 * Every few minutes, each company whose brain is shared reads the other
 * founder's changes and sends its own. On by being shared - sharing is the
 * asking - and quiet at launch like the rest. A failure is written on the
 * company, where Brain shows it, and the next pass tries again.
 */
const BRAIN_EVERY_MS = 3 * 60 * 1000;
const BRAIN_FIRST_MS = 20_000;
let brainTimer: ReturnType<typeof setTimeout> | null = null;
let brainRunning = false;

async function brainPass(): Promise<void> {
  if (brainRunning) return;
  brainRunning = true;
  try {
    const shared = getDatabase()
      .prepare(`SELECT id FROM companies WHERE brain_key IS NOT NULL AND is_archived = 0`)
      .all() as { id: string }[];
    for (const { id } of shared) {
      try {
        await syncBrain(getDatabase(), id);
      } catch {
        // syncBrain has written the reason on the company.
      }
    }
  } catch (error) {
    if (isFault(error)) logProblem("brain sync", error);
  } finally {
    brainRunning = false;
    brainTimer = setTimeout(() => void brainPass(), BRAIN_EVERY_MS);
  }
}

export function startBrainSync(): void {
  if (brainTimer) clearTimeout(brainTimer);
  brainTimer = setTimeout(() => void brainPass(), BRAIN_FIRST_MS);
}

export function stopBrainSync(): void {
  if (brainTimer) clearTimeout(brainTimer);
  brainTimer = null;
}
