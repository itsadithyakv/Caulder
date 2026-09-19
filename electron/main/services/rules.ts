import type { Db } from "../db/connection";
import { logProblem } from "../log";
import { createTask } from "../repositories/tasks";
import { shiftDay, today as todayIn } from "@shared/dates";
import { taskInput } from "@shared/domain";
import { followUpDays } from "./outreach";

/**
 * The one rule everybody wants, built in.
 *
 * A deal that moves into an open stage with nothing planned gets a follow-up
 * due in a few days. It replaces the rule builder: a follow-up after a move
 * was the rule everyone built, and a builder for the rest was a screen for a
 * feature nobody used. Won and lost stages are out, because closed is closed;
 * a lead with any open task is out, because something is already planned.
 * Zero days in Settings switches it off.
 *
 * Called from the stage writers for a move somebody made, not from
 * `onStageEntered`: the sample seed also sets stages, and a follow-up on a
 * lead that was written as already quiet would make it look planned.
 */
export function followUpIfNothingPlanned(db: Db, companyId: string, leadId: string, stageId: string): void {
  const days = followUpDays(db);
  if (days === 0) return;

  const stage = db.prepare(`SELECT kind FROM pipeline_stages WHERE id = ?`).get(stageId) as
    | { kind: string }
    | undefined;
  if (!stage || stage.kind !== "open") return;

  const planned = db
    .prepare(`SELECT 1 FROM tasks WHERE lead_id = ? AND status = 'open' LIMIT 1`)
    .get(leadId);
  if (planned) return;

  const timezone =
    (db.prepare(`SELECT timezone FROM companies WHERE id = ?`).get(companyId) as
      | { timezone: string }
      | undefined)?.timezone ?? "UTC";

  try {
    createTask(
      db,
      companyId,
      taskInput.parse({
        leadId,
        title: "Follow up",
        kind: "follow_up",
        dueOn: shiftDay(todayIn(timezone, new Date()), days),
      }),
    );
  } catch (error) {
    // Automation, not the person's work: losing the card move to save the
    // follow-up is the wrong trade. It is still written down.
    logProblem("follow-up", error);
  }
}
