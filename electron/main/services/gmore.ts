import { readFileSync } from "node:fs";
import type { Db } from "../db/connection";
import { backupNow } from "../db/backup";
import { findLead } from "../repositories/leads";
import { callScript } from "./gsync";
import type { DriveBackup, DriveBackups } from "@shared/data";

/**
 * The two other things the Google script does for Caulder: a contact into
 * Google Contacts, and a backup into Drive.
 *
 * Both go through the same script in the person's own account as the calendar
 * does (gsync.ts), for the same reason: Caulder never signs in to Google, so
 * there is no account to make, no app for Google to review, and nothing of
 * theirs that Caulder holds a key to. Both are something asked for, never
 * something a screen waits on.
 */

/**
 * A web app takes one request body, and a backup goes in it whole, as base64 -
 * a third larger than the file. Thirty megabytes of database is well inside
 * what Apps Script accepts and far more than a company's contacts and notes
 * come to; past it, the folder mirror in Settings is the way.
 */
const DRIVE_LIMIT = 30 * 1024 * 1024;

/**
 * One contact into Google Contacts, which is what a phone's address book syncs
 * with. One way: Caulder writes it and remembers which one it wrote, so saving
 * again updates that contact rather than making a second - and it never reads
 * the address book back.
 */
export async function saveLeadToGoogle(db: Db, leadId: string): Promise<{ made: boolean }> {
  const lead = findLead(db, leadId);
  if (!lead) throw new Error("That contact no longer exists.");
  const row = db.prepare(`SELECT google_contact FROM leads WHERE id = ?`).get(leadId) as { google_contact: string | null };

  const saved = await callScript<{ resourceName: string; made: boolean }>("saveContact", {
    contact: { name: lead.name, person: lead.contactPerson, phone: lead.phone, email: lead.email },
    resourceName: row.google_contact,
  });
  db.prepare(`UPDATE leads SET google_contact = ? WHERE id = ?`).run(saved.resourceName, leadId);
  return { made: saved.made };
}

/**
 * A fresh backup, and a copy of it in the "Caulder backups" folder in Drive.
 *
 * Fresh rather than the newest on disk, because the point of pressing this is
 * the work just done. The local copy is made first and stays whatever happens
 * to the upload: a backup that only exists if the network worked is not one.
 */
export async function backupToDrive(now: Date = new Date()): Promise<DriveBackup> {
  const local = backupNow(now);
  if (local.size > DRIVE_LIMIT) {
    throw new Error(
      `This backup is ${Math.round(local.size / (1024 * 1024))} MB, which is more than can be sent to Drive in one go. It is safe on this computer; to keep a copy elsewhere, choose a synced folder under "Also copy backups to".`,
    );
  }
  return callScript<DriveBackup>("backupPut", { name: local.name, data: readFileSync(local.path).toString("base64") });
}

export function driveBackups(): Promise<DriveBackups> {
  return callScript<DriveBackups>("backupList", {});
}
