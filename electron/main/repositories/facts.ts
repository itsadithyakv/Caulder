import { randomUUID } from "node:crypto";
import type { Db } from "../db/connection";
import type { Fact, FactInput, Task } from "@shared/domain";
import { createTask } from "./tasks";

/**
 * What stays true about a contact (PLAN.md, part twelve, phase 49): "prefers
 * WhatsApp", "address is 12 King St", "on leave till the 20th", a birthday.
 * Said to the line and kept on the contact - *Known about them* on their page
 * - rather than on their history, where a call and a fact read the same and
 * nothing finds the fact again.
 *
 * A birthday is a fact and a task that comes back every year, made with it.
 */

type Row = { id: string; lead_id: string; text: string; until_day: string | null; created_at: string };

const toFact = (row: Row): Fact => ({ id: row.id, leadId: row.lead_id, text: row.text, until: row.until_day, createdAt: row.created_at });

export function listFacts(db: Db, leadId: string): Fact[] {
  return (db.prepare(`SELECT * FROM lead_facts WHERE lead_id = ? ORDER BY created_at DESC`).all(leadId) as Row[]).map(toFact);
}

/** Who a contact is called in a task's title: the person's first name, else the company. */
function calledFor(db: Db, leadId: string): string {
  const lead = db.prepare(`SELECT name, contact_person FROM leads WHERE id = ?`).get(leadId) as { name: string; contact_person: string | null } | undefined;
  if (!lead) throw new Error("That contact no longer exists.");
  return lead.contact_person?.trim().split(/\s+/)[0] || lead.name;
}

/** Whether a fact is the contact's own birthday: their name, then "birthday", then when. */
function ownBirthday(db: Db, leadId: string, text: string): boolean {
  const said = /^(.*?)(?:'s|s'|’s)?\s*\b(?:birthday|bday|b'day)[\s:-]+(?:is\s+)?(?:on\s+)?\S/iu.exec(text);
  if (!said) return false;
  const lead = db.prepare(`SELECT name, contact_person FROM leads WHERE id = ?`).get(leadId) as { name: string; contact_person: string | null } | undefined;
  const names = `${lead?.name ?? ""} ${lead?.contact_person ?? ""}`.toLowerCase().split(/\s+/).filter(Boolean);
  const words = (said[1] ?? "").toLowerCase().replace(/['’]s?$/u, "").split(/\s+/).filter(Boolean);
  return words.every((word) => names.includes(word));
}

export function addFact(db: Db, companyId: string, input: FactInput): { facts: Fact[]; task: Task | null } {
  const lead = db.prepare(`SELECT 1 FROM leads WHERE id = ? AND company_id = ?`).get(input.leadId, companyId);
  if (!lead) throw new Error("That contact is not in this company.");
  return db.transaction(() => {
    db.prepare(`INSERT INTO lead_facts (id, company_id, lead_id, text, until_day, created_at) VALUES (?, ?, ?, ?, ?, ?)`).run(
      randomUUID(),
      companyId,
      input.leadId,
      input.text,
      input.until,
      new Date().toISOString(),
    );
    let task: Task | null = null;
    if (input.birthday) {
      // A birthday said again is a correction: the one said before goes, and its task moves.
      // Only their own: "Wife's birthday is 2 March" and "Hates birthday fuss" stay.
      const remove = db.prepare(`DELETE FROM lead_facts WHERE id = ?`);
      const earlier = db.prepare(`SELECT id, text FROM lead_facts WHERE lead_id = ? AND text <> ?`).all(input.leadId, input.text) as { id: string; text: string }[];
      for (const fact of earlier) if (ownBirthday(db, input.leadId, fact.text)) remove.run(fact.id);
      const title = `${calledFor(db, input.leadId)}'s birthday`;
      const already = db
        .prepare(`SELECT id, due_on FROM tasks WHERE company_id = ? AND lead_id = ? AND status = 'open' AND repeats = 'yearly' AND title = ?`)
        .get(companyId, input.leadId, title) as { id: string; due_on: string } | undefined;
      if (!already) {
        task = createTask(db, companyId, { title, kind: "todo", priority: null, dueOn: input.birthday, leadId: input.leadId, notes: null, repeats: "yearly" });
      } else if (already.due_on !== input.birthday) {
        db.prepare(`UPDATE tasks SET due_on = ?, repeat_day = ?, is_dirty = 1, updated_at = ? WHERE id = ?`).run(
          input.birthday,
          Number(input.birthday.slice(8, 10)),
          new Date().toISOString(),
          already.id,
        );
      }
    }
    return { facts: listFacts(db, input.leadId), task };
  })();
}

export function removeFact(db: Db, id: string): void {
  db.prepare(`DELETE FROM lead_facts WHERE id = ?`).run(id);
}

/** Facts that end and have not yet: "on leave till the 20th", for a task planned for them before then. */
export function listAway(db: Db, companyId: string, today: string): { leadId: string; text: string; until: string }[] {
  return (
    db
      .prepare(`SELECT lead_id, text, until_day FROM lead_facts WHERE company_id = ? AND until_day IS NOT NULL AND until_day >= ? ORDER BY until_day`)
      .all(companyId, today) as { lead_id: string; text: string; until_day: string }[]
  ).map((row) => ({ leadId: row.lead_id, text: row.text, until: row.until_day }));
}

/**
 * Facts a question is about: every word that means something in it is in
 * the fact or the contact's name - "what does maya prefer", "sam's address".
 */
export function factsAbout(db: Db, companyId: string, about: string): { label: string; detail: string }[] {
  const asked = about
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 2 && !/^(?:the|and|what|does|did|whats|who|how|their|his|her|is|are|was|for|our|my)$/.test(word))
    .map((word) => word.replace(/(?:'s|s)$/, ""));
  if (asked.length === 0) return [];
  const rows = db
    .prepare(
      `SELECT f.text, l.name, l.contact_person FROM lead_facts f JOIN leads l ON l.id = f.lead_id
       WHERE f.company_id = ? ORDER BY f.created_at DESC`,
    )
    .all(companyId) as { text: string; name: string; contact_person: string | null }[];
  return rows
    .filter((row) => {
      const haystack = `${row.text} ${row.name} ${row.contact_person ?? ""}`.toLowerCase();
      return asked.every((word) => haystack.includes(word));
    })
    .slice(0, 5)
    .map((row) => ({ label: row.text, detail: row.contact_person ? `${row.contact_person}, ${row.name}` : row.name }));
}
