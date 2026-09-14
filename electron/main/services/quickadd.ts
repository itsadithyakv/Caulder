import type { Db } from "../db/connection";
import { createTask } from "../repositories/tasks";
import { createBlock } from "../repositories/blocks";
import { blockKindFor } from "@shared/quickadd";
import { occurrencesOf } from "@shared/repeat";
import { blockInput, taskInput, type QuickInput, quickInput, type Task } from "@shared/domain";

/**
 * A task from the quick-add line, and the hour set aside for it.
 *
 * With a time, one line makes two things, because Caulder keeps them apart on
 * purpose: the task is what is due and what reaches Google Tasks on the
 * phone; the block is the hour it occupies, and the thing that gets a
 * reminder at ten to. "Datascience assignment at 4pm" wants both.
 *
 * A repeat - "gym every mon wed fri 6am" - makes the hours and no task at
 * all. The gym is not done once and ticked off; it is a run of blocks, and
 * the block series already knows how to be one.
 *
 * **One transaction.** A task written and its block refused would be the half
 * of the request nobody asked for - due today, with the four o'clock quietly
 * missing - so if the block cannot be made, neither is the task.
 */
export function quickAdd(
  db: Db,
  companyId: string,
  raw: QuickInput,
): { task: Task | null; blocked: boolean; repeats: number } {
  const input = quickInput.parse(raw);

  if (input.repeat && input.time !== null) {
    // createBlock writes the series and every occurrence in its own
    // transaction, and refuses a repeat that lands on no day at all.
    createBlock(
      db,
      companyId,
      blockInput.parse({
        day: input.day,
        startsAt: input.time,
        minutes: input.minutes ?? 60,
        title: input.title,
        kind: blockKindFor(input),
        notes: null,
        taskId: null,
        priority: input.priority,
        remindMinutes: null,
        repeat: input.repeat,
      }),
    );
    const repeats = occurrencesOf({ weekdays: input.repeat.weekdays, from: input.day, until: input.repeat.until }).length;
    return { task: null, blocked: true, repeats };
  }

  return db.transaction(() => {
    const task = createTask(
      db,
      companyId,
      taskInput.parse({
        title: input.title,
        kind: input.kind,
        area: input.area,
        priority: input.priority,
        dueOn: input.day,
        leadId: null,
        notes: null,
      }),
    );

    if (input.time === null) return { task, blocked: false, repeats: 0 };

    createBlock(
      db,
      companyId,
      blockInput.parse({
        day: input.day,
        startsAt: input.time,
        // An hour when nothing was said: the length is shown before anything
        // is added, and an hour is what "at four" usually means.
        minutes: input.minutes ?? 60,
        title: input.title,
        kind: blockKindFor(input),
        notes: null,
        taskId: task.id,
        priority: input.priority,
        remindMinutes: null,
        repeat: null,
      }),
    );

    return { task, blocked: true, repeats: 0 };
  })();
}
