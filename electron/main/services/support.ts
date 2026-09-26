import type Database from "better-sqlite3";
import { z } from "zod";
import { today as todayIn } from "@shared/dates";
import { answerSupport, supportAsk } from "@shared/support";
import { homeCompanyId } from "../repositories/companies";
import { getSetting, setSetting } from "../repositories/settings";

type Db = Database.Database;

/**
 * The ask for support on Today (part six): whether it is due, and the answer.
 * The day goes by your own workspace's clock, like the journal nudge - it is
 * about you, not a company.
 */

function todayHere(db: Db, now: Date): string {
  const home = homeCompanyId(db);
  const place = (
    home
      ? db.prepare(`SELECT timezone FROM companies WHERE id = ?`).get(home)
      : db.prepare(`SELECT timezone FROM companies ORDER BY created_at LIMIT 1`).get()
  ) as { timezone: string } | undefined;
  return todayIn(place?.timezone ?? "UTC", now);
}

/** Whether to ask today. The first time it is read, it only sets the day to ask on. */
export function supportState(db: Db, now: Date): { ask: boolean } {
  const { ask, store } = supportAsk(getSetting(db, "supportAsk"), todayHere(db, now));
  if (store) setSetting(db, "supportAsk", store);
  return { ask };
}

const answer = z.enum(["later", "never"], { error: "That is not an answer to the ask." });

/** *Not now* asks again in three months; *I have* and *Don't ask again* end it. */
export function answerSupportAsk(db: Db, raw: unknown, now: Date): void {
  setSetting(db, "supportAsk", answerSupport(answer.parse(raw), todayHere(db, now)));
}
