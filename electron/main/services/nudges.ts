import { randomUUID } from "node:crypto";
import { Notification, type BrowserWindow } from "electron";
import type { Db } from "../db/connection";
import { getDatabase } from "../db/connection";
import { markFile } from "../identity";
import { isFault, logProblem } from "../log";
import { getSetting, setSetting } from "../repositories/settings";
import { homeCompanyId } from "../repositories/companies";
import { minutesOf, startOfWeek, timeNow, today as todayIn, weekdayOf } from "@shared/dates";
import { MORNING, nudgeDue, nudgeInput, reminderDue, renewalsToTell, sayBrief, sayRenewal, sayReminder, type NudgeSettings } from "@shared/nudges";
import { renewalsFor } from "./costs";

/**
 * The notifications Caulder sends by itself (shared/nudges.ts says when and
 * what): reminders the line was asked for, and the morning brief. Windows shows each as a notification; clicking one
 * brings Caulder to where it is about.
 *
 * Every half minute, which is one indexed read or two: a reminder for 14:20
 * has to arrive at 14:20, not up to five minutes later.
 */

const TICK_MS = 30_000;
let timer: NodeJS.Timeout | null = null;

type Place = "today";
type Show = (note: { title: string; body: string }, place: Place) => void;

export function startNudges(getWindow: () => BrowserWindow | null): void {
  stopNudges();
  const show: Show = (note, place) => {
    if (!Notification.isSupported()) return;
    const notification = new Notification({ title: note.title, body: note.body, icon: markFile("notify"), silent: false });
    notification.on("click", () => {
      const window = getWindow();
      if (!window) return;
      if (window.isMinimized()) window.restore();
      // Shown as well as focused: it may be hidden in the tray.
      window.show();
      window.focus();
      window.webContents.send("nav:go", place);
    });
    notification.show();
  };
  const tick = () => {
    try {
      checkNudges(getDatabase(), new Date(), show);
    } catch (error) {
      if (isFault(error)) logProblem("nudges", error);
    }
  };
  timer = setInterval(tick, TICK_MS);
  // Shortly after launch too: opening the laptop at 14:21 should still bring the 14:20 reminder.
  setTimeout(tick, 6_000);
}

export function stopNudges(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

/**
 * The morning brief is on at nine unless it was switched off (23 October
 * 2026, the owner's word): off until switched on, nobody switched it on, and
 * a call due yesterday went by without a word. Never set is nine; switched
 * off is kept as an empty value.
 */
export function nudgeSettings(db: Db): NudgeSettings {
  const saved = getSetting(db, "briefAt");
  return { briefAt: saved === null ? MORNING : saved || null };
}

export function setNudgeSettings(db: Db, raw: unknown): NudgeSettings {
  const input = nudgeInput.parse(raw);
  setSetting(db, "briefAt", input.briefAt ?? "");
  return nudgeSettings(db);
}

/** A line that said "remind me": kept against the task, at its day and time where the workspace is. */
export function addReminder(db: Db, input: { companyId: string; taskId: string | null; title: string; day: string; time: string | null }): void {
  db.prepare(
    `INSERT INTO reminders (id, company_id, task_id, title, day, time, told_at, created_at) VALUES (?, ?, ?, ?, ?, ?, NULL, ?)`,
  ).run(randomUUID(), input.companyId, input.taskId, input.title, input.day, input.time, new Date().toISOString());
}

type Due = { id: string; title: string; day: string; time: string | null; company: string; timezone: string };

/** One pass: what is due, said, and written down as said so it is said once. Exported for the tests, with its own clock. */
export function checkNudges(db: Db, now: Date, show: Show): void {
  const settings = nudgeSettings(db);

  // Reminders, in every workspace, at its own clock. Never for a task already done.
  const waiting = db
    .prepare(
      `SELECT r.id, r.title, r.day, r.time, c.name AS company, c.timezone
         FROM reminders r
         JOIN companies c ON c.id = r.company_id
         LEFT JOIN tasks t ON t.id = r.task_id
        WHERE r.told_at IS NULL AND c.is_archived = 0 AND (t.id IS NULL OR t.status = 'open')`,
    )
    .all() as Due[];
  for (const reminder of waiting) {
    const today = todayIn(reminder.timezone, now);
    const at = minutesOf(timeNow(reminder.timezone, now));
    if (!reminderDue(reminder, today, at, settings.briefAt ?? MORNING)) continue;
    show(sayReminder(reminder, today, reminder.company), "today");
    db.prepare(`UPDATE reminders SET told_at = ? WHERE id = ?`).run(now.toISOString(), reminder.id);
  }
  // A reminder for a task that was done first is not going to be said; it is settled as it stands.
  db.prepare(
    `UPDATE reminders SET told_at = ? WHERE told_at IS NULL AND task_id IN (SELECT id FROM tasks WHERE status = 'done')`,
  ).run(now.toISOString());

  // The daily two go by your own workspace's clock: they are about your day, not a company's.
  const home = homeCompanyId(db);
  if (!home) return;
  const place = db.prepare(`SELECT timezone FROM companies WHERE id = ?`).get(home) as { timezone: string } | undefined;
  if (!place) return;
  const today = todayIn(place.timezone, now);
  const at = minutesOf(timeNow(place.timezone, now));

  if (nudgeDue(settings.briefAt, at, getSetting(db, "briefed"), today)) {
    setSetting(db, "briefed", today);
    // Across every workspace: the brief is of your day, and a day has one of you in it.
    const due = db
      .prepare(
        `SELECT t.title, t.priority FROM tasks t JOIN companies c ON c.id = t.company_id
          WHERE c.is_archived = 0 AND t.status = 'open' AND t.due_on = ?
          ORDER BY CASE t.priority WHEN 'must' THEN 0 WHEN 'should' THEN 1 ELSE 2 END, t.created_at`,
      )
      .all(today) as { title: string; priority: string | null }[];
    const late = (
      db
        .prepare(
          `SELECT COUNT(*) AS n FROM tasks t JOIN companies c ON c.id = t.company_id
            WHERE c.is_archived = 0 AND t.status = 'open' AND t.due_on < ?`,
        )
        .get(today) as { n: number }
    ).n;
    // On a Monday, the week's three still to do, chosen at the head of the Calendar's week.
    const three =
      weekdayOf(today) === 1
        ? (
            db
              .prepare(
                `SELECT w.text FROM week_things w JOIN companies c ON c.id = w.company_id
                  WHERE c.is_archived = 0 AND w.week_start = ? AND w.done_at IS NULL ORDER BY w.position`,
              )
              .all(startOfWeek(today)) as { text: string }[]
          ).map((row) => row.text)
        : [];
    const brief = sayBrief(due.map((task) => ({ title: task.title, must: task.priority === "must" })), late, three);
    if (brief) show(brief, "today");

    // What renews, in every company, by its own clock: once as it comes into view, again on its day.
    let told: string[] = [];
    try {
      told = JSON.parse(getSetting(db, "renewalsTold") ?? "[]") as string[];
    } catch {
      told = [];
    }
    const companies = db.prepare(`SELECT id, name, timezone FROM companies WHERE is_archived = 0 AND kind <> 'personal'`).all() as {
      id: string;
      name: string;
      timezone: string;
    }[];
    const live: string[] = [];
    for (const company of companies) {
      const day = todayIn(company.timezone, now);
      const renewals = renewalsFor(db, company.id, day);
      live.push(...renewals.flatMap((each) => [`${each.pageId}|${each.nextOn}|soon`, `${each.pageId}|${each.nextOn}|due`]));
      const { tell, marks } = renewalsToTell(renewals, told);
      for (const renewal of tell) show(sayRenewal(renewal, day, company.name), "today");
      told = [...told, ...marks];
    }
    // Only the marks of what is still in view are kept, so the list never grows.
    setSetting(db, "renewalsTold", JSON.stringify(told.filter((mark) => live.includes(mark))));
  }

}

/** "Send a test notification": proof, from Settings, that Windows is letting Caulder's notifications through. */
export function testNotification(getWindow: () => BrowserWindow | null): boolean {
  if (!Notification.isSupported()) return false;
  const notification = new Notification({
    title: "Caulder can reach you",
    body: "This is how reminders and the morning brief will arrive.",
    icon: markFile("notify"),
    silent: false,
  });
  notification.on("click", () => {
    const window = getWindow();
    window?.show();
    window?.focus();
  });
  notification.show();
  return true;
}
