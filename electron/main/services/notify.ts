import { Notification } from "electron";
import type { BrowserWindow } from "electron";
import { markFile } from "../identity";
import { getDatabase } from "../db/connection";
import { getSetting } from "../repositories/settings";
import { listCompanies } from "../repositories/companies";
import { countOverdue } from "../repositories/tasks";
import { dueNowCount } from "./deadlines";
import { today as todayIn } from "@shared/dates";

/**
 * Telling you about work you cannot see.
 *
 * The widget is passive - it says what is due only if you look at it. This is
 * the part that knocks, and everything about it is built around not becoming
 * the thing you turn off in week two:
 *
 *  - **Once a day, not once an hour.** A reminder you have already read is
 *    noise, and noise is what teaches people to dismiss without looking.
 *  - **Only when there is something.** No "nothing is due" notification.
 *  - **Off by default.** An app that starts notifying you before you have
 *    asked it to has already lost the argument.
 */

/** Checked this often. The work is one COUNT query per company. */
const TICK_MS = 5 * 60 * 1000;

/** Not before this hour, in the company's own timezone. */
const NOT_BEFORE = 9;

let timer: NodeJS.Timeout | null = null;
/** The day each company was last told about, so it is told once. */
const told = new Map<string, string>();

export function notificationsOn(): boolean {
  try {
    return getSetting(getDatabase(), "notify") === "1";
  } catch {
    // Asked before the database is open, which is not a reason to fail.
    return false;
  }
}

export function startNotifications(getWindow: () => BrowserWindow | null): void {
  stopNotifications();
  timer = setInterval(() => check(getWindow), TICK_MS);
  // And once shortly after launch, so opening the app in the morning tells
  // you about the morning rather than waiting five minutes to.
  setTimeout(() => check(getWindow), 20_000);
}

export function stopNotifications(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

/** Clears the "already told" record, so a re-enable is heard from today. */
export function resetNotified(): void {
  told.clear();
}

function check(getWindow: () => BrowserWindow | null): void {
  if (!notificationsOn() || !Notification.isSupported()) return;

  let companies;
  try {
    companies = listCompanies(getDatabase());
  } catch {
    return;
  }

  const now = new Date();

  for (const company of companies) {
    if (company.isArchived) continue;

    const day = todayIn(company.timezone, now);
    if (told.get(company.id) === day) continue;

    // Nine in the morning where the company is, not where the machine thinks
    // it is. A reminder at 4am is an alarm clock.
    const hour = Number(
      new Intl.DateTimeFormat("en-GB", {
        hour: "numeric",
        hour12: false,
        timeZone: company.timezone,
      }).format(now),
    );
    if (Number.isFinite(hour) && hour < NOT_BEFORE) continue;

    const overdue = countOverdue(getDatabase(), company.id, day);
    // Filings, notice dates and expiries due today or late: the ones a missed
    // day costs money for, so they count as much as a late task.
    const deadlines = dueNowCount(getDatabase(), company.id, day);
    if (overdue === 0 && deadlines === 0) {
      // Nothing to say. Marked as told anyway, so a quiet morning does not
      // leave it checking again every five minutes for the rest of the day.
      told.set(company.id, day);
      continue;
    }

    told.set(company.id, day);

    const parts = [
      overdue === 0 ? null : overdue === 1 ? "One task was due before today." : `${overdue} tasks were due before today.`,
      deadlines === 0
        ? null
        : deadlines === 1
          ? "One deadline is due today or late."
          : `${deadlines} deadlines are due today or late.`,
    ].filter(Boolean);

    const notification = new Notification({
      title: `${overdue + deadlines} to see to in ${company.name}`,
      body: parts.join(" "),
      // The mark beside the words, so it reads as Caulder at a glance.
      icon: markFile("notify"),
      silent: false,
    });

    notification.on("click", () => {
      const window = getWindow();
      if (!window) return;
      if (window.isMinimized()) window.restore();
      // Shown as well as focused: the window may be hidden in the tray, and
      // focusing a hidden window does nothing anybody can see.
      window.show();
      window.focus();
    });

    notification.show();
  }
}
