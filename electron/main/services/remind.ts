import { Notification } from "electron";
import { isFault, logProblem } from "../log";
import type { BrowserWindow } from "electron";
import { brandFile } from "../identity";
import { getDatabase } from "../db/connection";
import { listBlocks, markReminded } from "../repositories/blocks";
import { dueReminders, startsWording } from "@shared/remind";
import { minutesOf, shiftTime, timeNow, today as todayIn } from "@shared/dates";

/**
 * Knocking before a block starts.
 *
 * `notify.ts` is the once-a-day summary; this is the one that arrives at ten
 * to nine. They are separate because they answer different questions and have
 * opposite cadences — a daily digest checked every five minutes is fine, and a
 * reminder about a nine o'clock lecture checked every five minutes arrives
 * anywhere between ten and fifteen minutes early, which is a reminder you
 * stop trusting.
 *
 * Everything about when to speak lives in `shared/remind.ts` and is tested
 * there. This is the plumbing: read the day, ask, say it, write down that it
 * was said.
 */

/**
 * Half a minute.
 *
 * The work is one indexed read of one day per workspace, which is nothing, and
 * the alternative is a reminder that is late by up to a whole tick. Ten to
 * nine has to mean ten to nine or the number in the setting is decoration.
 */
const TICK_MS = 30_000;

let timer: NodeJS.Timeout | null = null;

export function startReminders(getWindow: () => BrowserWindow | null): void {
  stopReminders();
  timer = setInterval(() => check(getWindow), TICK_MS);
  // And once shortly after launch. Opening the laptop five minutes before a
  // lecture and being told about it is most of the value of the feature.
  setTimeout(() => check(getWindow), 4_000);
}

export function stopReminders(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

type Asking = { id: string; name: string; timezone: string; remind_minutes: number };

/**
 * The workspaces that have asked to be told, and nothing else.
 *
 * Written as a query rather than filtering `listCompanies`, so that a
 * workspace with reminders off costs exactly nothing every thirty seconds.
 * "Off means off" should be true of the machine as well as the behaviour.
 */
function asking(): Asking[] {
  try {
    return getDatabase()
      .prepare(
        `SELECT id, name, timezone, remind_minutes
           FROM companies
          WHERE is_archived = 0 AND remind_minutes IS NOT NULL`,
      )
      .all() as Asking[];
  } catch (error) {
    // Asked before the database is open, which is not a reason to fail. A
    // real fault is, and goes in the log.
    if (isFault(error)) logProblem("reminders", error);
    return [];
  }
}

function check(getWindow: () => BrowserWindow | null): void {
  if (!Notification.isSupported()) return;

  const now = new Date();

  for (const company of asking()) {
    // The clock where the workspace is, not where the machine is. The same
    // rule the whole day layer follows, and the reason a 6pm flight does not
    // make tomorrow's timetable look like today's.
    const day = todayIn(company.timezone, now);
    const minutes = minutesOf(timeNow(company.timezone, now));

    let due;
    try {
      due = dueReminders(
        listBlocks(getDatabase(), company.id, day),
        minutes,
        company.remind_minutes,
      );
    } catch (error) {
      logProblem("reminders", error);
      continue;
    }
    if (due.length === 0) continue;

    for (const { block, inMinutes } of due) {
      const notification = new Notification({
        title: `${block.title} ${startsWording(inMinutes)}`,
        body: `${block.startsAt} – ${shiftTime(block.startsAt, block.minutes)} · ${company.name}`,
        // The mark beside the words, so it reads as Caulder at a glance.
        icon: brandFile("notify.png"),
        silent: false,
      });

      notification.on("click", () => {
        const window = getWindow();
        if (!window) return;
        if (window.isMinimized()) window.restore();
        // Shown as well as focused: the window may be hidden in the tray.
        window.show();
        window.focus();
      });

      notification.show();
    }

    // Written after they are shown rather than before. A reminder marked as
    // given for a notification that never appeared is one you never get, and
    // the failure is silent; the other way round costs a repeat at worst.
    markReminded(
      getDatabase(),
      due.map((entry) => entry.block.id),
      now.toISOString(),
    );
  }
}
