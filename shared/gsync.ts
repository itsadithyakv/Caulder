/**
 * Deciding what to send, what to take, and what to delete.
 *
 * Every rule about reconciling Caulder with Google lives here, as arithmetic
 * over two lists. There is no network in this file and no database — the
 * service gathers both sides, asks for a plan, and carries it out.
 *
 * That split is not tidiness. Two-way sync is the part of this feature that
 * can lose somebody's work, and the only way to be sure it does not is to be
 * able to write the awkward cases down as tests: an event deleted in Google, a
 * block edited on both sides, a window that did not cover what it was asked
 * about.
 *
 * Three rules govern all of it.
 *
 *  1. **Nothing is matched on title or time.** The join is an id, the way the
 *     email bridge joins on `message_id`. Two meetings called "Call" at ten
 *     o'clock are not the same meeting, and a sync that thinks so merges them.
 *
 *  2. **Ownership settles a conflict, not recency.** Whoever created a thing
 *     owns it. Last-write-wins looks reasonable and quietly destroys the side
 *     that happened to be edited first.
 *
 *  3. **Absence only means deletion inside the window that was asked about.**
 *     This is the rule that stops a narrow query wiping a year of history, and
 *     it is the one every naive implementation gets wrong.
 */

/** An event as Google described it. */
export type RemoteEvent = {
  id: string;
  /** Changes whenever Google's copy changes. Null when it did not say. */
  etag: string | null;
  /** The Caulder block this mirrors, when Caulder made it. */
  caulderId: string | null;
  title: string;
  /** `YYYY-MM-DD`. */
  day: string;
  /** `HH:MM`. */
  startsAt: string;
  minutes: number;
};

/** The part of a block this file needs. */
export type LocalBlock = {
  id: string;
  day: string;
  startsAt: string;
  minutes: number;
  title: string;
  source: "caulder" | "google";
  externalId: string | null;
  etag: string | null;
  isDirty: boolean;
};

type EventPlan = {
  /** Ours, never sent before. */
  create: LocalBlock[];
  /** Ours, changed here since it was last sent. */
  update: LocalBlock[];
  /** Google's ids to delete there, from tombstones. */
  remove: string[];
  /** Theirs, not here yet. */
  adopt: RemoteEvent[];
  /** Theirs, changed there. */
  refresh: { block: LocalBlock; from: RemoteEvent }[];
  /** Ours, whose event somebody deleted in Google. Sent again. */
  restore: LocalBlock[];
  /** Mirrors of events that are gone from Google. Deleted here. */
  drop: LocalBlock[];
  /** Changed on both sides. The owner won; the count is what the screen says. */
  conflicts: number;
};

/** Whether two descriptions of the same slot actually differ. */
function differs(block: LocalBlock, event: RemoteEvent): boolean {
  return (
    block.title !== event.title ||
    block.day !== event.day ||
    block.startsAt !== event.startsAt ||
    block.minutes !== event.minutes
  );
}

/**
 * What to do about the calendar.
 *
 * `window` is the range that was actually asked of Google. Blocks outside it
 * are left completely alone — not pushed, not pulled, and above all not
 * deleted. Google was never asked about them, so its silence says nothing.
 */
export function planEvents(
  local: readonly LocalBlock[],
  remote: readonly RemoteEvent[],
  tombstones: readonly string[],
  window: { from: string; to: string },
): EventPlan {
  // Built fresh rather than spread from a shared blank. Spreading copies the
  // array *references*, so every call would append to one set of lists and the
  // second sync of a session would carry the first one's plan.
  const plan: EventPlan = {
    create: [],
    update: [],
    remove: [...tombstones],
    adopt: [],
    refresh: [],
    restore: [],
    drop: [],
    conflicts: 0,
  };

  const inWindow = (day: string) => day >= window.from && day <= window.to;

  const byExternal = new Map<string, LocalBlock>();
  for (const block of local) {
    if (block.externalId) byExternal.set(block.externalId, block);
  }

  const seen = new Set<string>();

  for (const event of remote) {
    const block = byExternal.get(event.id);

    if (!block) {
      // Something made in Google. An event carrying a caulderId we no longer
      // hold is deliberately adopted rather than skipped: the block it named
      // is gone from here, so the event is now the only copy, and dropping it
      // would lose it.
      plan.adopt.push(event);
      continue;
    }

    seen.add(event.id);

    // The etag is the only honest answer to "did Google's copy change". A
    // missing one means it would not say, and the safe reading is that it did.
    const remoteChanged = block.etag === null || block.etag !== event.etag;

    if (!block.isDirty && !remoteChanged) continue;

    if (block.isDirty && remoteChanged) {
      plan.conflicts += 1;
      if (block.source === "caulder") plan.update.push(block);
      else plan.refresh.push({ block, from: event });
      continue;
    }

    if (block.isDirty) {
      plan.update.push(block);
      continue;
    }

    // Only Google changed, and only worth writing if it actually differs -
    // an etag can move for reasons that do not touch anything we store.
    if (differs(block, event)) plan.refresh.push({ block, from: event });
  }

  for (const block of local) {
    if (!block.externalId) {
      // Never sent. Only what falls inside the window, so a plan for next
      // March is not uploaded by a sync of this week.
      if (inWindow(block.day)) plan.create.push(block);
      continue;
    }

    if (seen.has(block.externalId)) continue;

    // Had an event, and Google did not return it. That only means deletion if
    // Google was asked about this day at all.
    if (!inWindow(block.day)) continue;

    if (block.source === "google") plan.drop.push(block);
    else plan.restore.push(block);
  }

  return plan;
}

/* ---- Tasks --------------------------------------------------------------
 *
 * Simpler, because Google Tasks has a date and no time - which is exactly what
 * `tasks.due_on` already is. The one thing worth care is that "done" is a
 * state both sides can set, and neither side owns it.
 * ------------------------------------------------------------------------ */

export type RemoteTask = {
  id: string;
  title: string;
  /** `YYYY-MM-DD`, or null for a task with no date. */
  due: string | null;
  notes: string | null;
  done: boolean;
};

export type LocalTask = {
  id: string;
  title: string;
  dueOn: string;
  notes: string | null;
  done: boolean;
  externalId: string | null;
  /** Whether it changed here since the last sync. */
  isDirty: boolean;
};

type TaskPlan = {
  create: LocalTask[];
  update: LocalTask[];
  remove: string[];
  adopt: RemoteTask[];
  refresh: { task: LocalTask; from: RemoteTask }[];
  drop: LocalTask[];
  conflicts: number;
};

function taskDiffers(task: LocalTask, remote: RemoteTask): boolean {
  return (
    task.title !== remote.title ||
    task.done !== remote.done ||
    (remote.due !== null && task.dueOn !== remote.due) ||
    (task.notes ?? "") !== (remote.notes ?? "")
  );
}

/**
 * What to do about the task list.
 *
 * Google Tasks has no etag, so "did it change there" cannot be asked directly.
 * The comparison is against what we hold instead, which means a task edited on
 * both sides in the same way is simply agreed rather than reported as a clash.
 * That is the right outcome and it falls out for free.
 *
 * **Completion is never undone by a sync.** A task done on either side is done:
 * having Google reopen something you ticked, or the reverse, is the one
 * behaviour that would make somebody stop trusting this immediately. The same
 * reasoning as the email status ladder, which also never goes backwards.
 */
export function planTasks(
  local: readonly LocalTask[],
  remote: readonly RemoteTask[],
  tombstones: readonly string[],
  /**
   * Whether `remote` is the WHOLE list.
   *
   * This is the calendar's window rule wearing different clothes, and the
   * first version of this file got it wrong: it assumed a task list always
   * comes back in one piece, so anything missing had been deleted. Google
   * returns a page at a time. With a hundred and one tasks, every sync would
   * have silently deleted the tail of the list.
   *
   * Nothing is ever dropped unless the caller can vouch that it read to the
   * end. A page that could not be finished means "I do not know", and the
   * safe reading of "I do not know" is to leave things alone.
   */
  listingComplete: boolean,
): TaskPlan {
  const plan: TaskPlan = {
    create: [],
    update: [],
    remove: [...tombstones],
    adopt: [],
    refresh: [],
    drop: [],
    conflicts: 0,
  };

  const byExternal = new Map<string, LocalTask>();
  for (const task of local) {
    if (task.externalId) byExternal.set(task.externalId, task);
  }

  const seen = new Set<string>();

  for (const entry of remote) {
    const task = byExternal.get(entry.id);

    if (!task) {
      plan.adopt.push(entry);
      continue;
    }

    seen.add(entry.id);
    if (!taskDiffers(task, entry)) continue;

    // Done wins, whichever side said so, and it is not a conflict.
    if (task.done !== entry.done) {
      if (task.done) plan.update.push(task);
      else plan.refresh.push({ task, from: entry });
      continue;
    }

    if (task.isDirty) {
      plan.conflicts += 1;
      plan.update.push(task);
      continue;
    }

    plan.refresh.push({ task, from: entry });
  }

  for (const task of local) {
    if (!task.externalId) {
      plan.create.push(task);
      continue;
    }
    if (seen.has(task.externalId)) continue;

    // Absent from an incomplete listing says nothing at all.
    if (!listingComplete) continue;

    // And a finished task is never dropped, however complete the listing.
    // Google prunes completed tasks out of a list after a while, which is
    // tidying on their side and would be the loss of your record of having
    // done it on ours.
    if (task.done) continue;

    plan.drop.push(task);
  }

  return plan;
}
