import { randomUUID } from "node:crypto";
import type { Db } from "../db/connection";
import { createLead, setLeadStage, writeActivity } from "../repositories/leads";
import { createTask, completeTask } from "../repositories/tasks";
import { listStages } from "../repositories/companies";
import { leadInput, taskInput } from "@shared/domain";
import { shiftDay, today as todayIn } from "@shared/dates";

/**
 * Sample data, so a new company is not six empty screens.
 *
 * Every screen in Caulder is about a list you have already built, which makes
 * the first ten minutes the worst ten minutes: nothing to look at, and no way
 * to tell what the app is for by looking at it. This seeds a small, realistic
 * week of work so Today has something overdue, the board has a shape, and the
 * email queue shows the whole status ladder.
 *
 * **It is seeded as an import batch.** That is not a trick - it genuinely is
 * one, and it means removing it is the Undo that already exists rather than a
 * second delete path written specially. Every task, activity and message hangs
 * off a lead and goes with it by cascade, so undoing the batch leaves the
 * company exactly as it was before.
 *
 * The dates are all relative to now, so the sample never looks stale.
 */

/** Marks the batch, so it can be found and offered for removal later. */
const DEMO_FILENAME = "Sample data";

type Seed = {
  name: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  city?: string;
  value?: number;
  /** Index into the company's stages. */
  stage: number;
  /** Days ago the last contact was, if there was one. */
  spokeDaysAgo?: number;
  note?: string;
  task?: { title: string; kind: "call" | "email" | "follow_up" | "meeting"; inDays: number };
};

const SEEDS: Seed[] = [
  {
    name: "Oakridge International School",
    contactPerson: "Asha Menon",
    email: "asha@oakridge.example.in",
    phone: "9480004094",
    city: "Bengaluru",
    value: 250000,
    stage: 3,
    spokeDaysAgo: 2,
    note: "Asha was interested in the attendance module. Wants to see it against their existing register before deciding.",
    task: { title: "Send the attendance walkthrough", kind: "email", inDays: 0 },
  },
  {
    name: "TRIO World School",
    contactPerson: "Nandini R",
    email: "admissions@trio.example.com",
    phone: "9141924141",
    city: "Bengaluru",
    value: 120000,
    stage: 2,
    spokeDaysAgo: 6,
    note: "Asked what happens to last year's data on migration. Said budget is decided in March.",
    // Overdue on purpose: Today is not worth opening if nothing is ever late.
    task: { title: "Call back about the March budget", kind: "call", inDays: -2 },
  },
  {
    name: "Bengaluru Public School",
    contactPerson: "R Krishnan",
    phone: "9880012345",
    city: "Bengaluru",
    value: 90000,
    stage: 1,
    spokeDaysAgo: 1,
    task: { title: "Call the principal", kind: "call", inDays: 0 },
  },
  {
    name: "GIG International School",
    contactPerson: "Meera Rao",
    email: "meera@gig.example.edu",
    phone: "9845098450",
    city: "Mysuru",
    value: 80000,
    stage: 1,
    task: { title: "Follow up on the brochure", kind: "follow_up", inDays: 1 },
  },
  {
    name: "Cambridge Public School",
    email: "office@cambridge.example.in",
    city: "Bengaluru",
    stage: 0,
  },
  {
    // No task and nothing recent: this is the one that shows up under
    // "Going quiet", which is the section a spreadsheet cannot produce.
    name: "Vishweshwarayya Vidya Kendra",
    email: "office@vvk.example.in",
    city: "Bengaluru",
    value: 45000,
    stage: 1,
    spokeDaysAgo: 24,
    note: "Left a message with reception. Nobody has come back.",
  },
  {
    name: "Prajna Vahini School",
    contactPerson: "S Bhat",
    phone: "9480040338",
    city: "Bengaluru",
    value: 60000,
    stage: 4,
    spokeDaysAgo: 9,
    note: "Signed. Rollout starts after the term break.",
  },
  {
    name: "Sunrise Academy",
    contactPerson: "P Sharma",
    email: "p.sharma@sunrise.example.in",
    city: "Mysuru",
    stage: 5,
    spokeDaysAgo: 15,
    note: "Went with a competitor on price. Worth another look next year.",
  },
];

/**
 * Seeds the sample and returns the batch id, which is how it is removed again.
 * One transaction: a half-seeded sample is worse than none.
 */
export function seedDemo(db: Db, companyId: string, now: Date = new Date()): string {
  const stages = listStages(db, companyId);
  const timezone = companyTimezone(db, companyId);
  const day = todayIn(timezone, now);
  const batchId = randomUUID();

  return db.transaction(() => {
    db.prepare(
      `INSERT INTO import_batches (
         id, company_id, filename, file_type, mapping,
         row_count, created_count, updated_count, skipped_count,
         before_image, created_at
       ) VALUES (?, ?, ?, 'csv', '{}', ?, ?, 0, 0, '{}', ?)`,
    ).run(batchId, companyId, DEMO_FILENAME, SEEDS.length, SEEDS.length, now.toISOString());

    for (const seed of SEEDS) {
      const stage = stages[Math.min(seed.stage, stages.length - 1)];
      const lead = createLead(
        db,
        companyId,
        leadInput.parse({
          name: seed.name,
          contactPerson: seed.contactPerson ?? null,
          email: seed.email ?? null,
          phone: seed.phone ?? null,
          city: seed.city ?? null,
          value: seed.value ?? null,
          source: "Sample data",
          stageId: stage?.id ?? null,
        }),
      );

      db.prepare(`UPDATE leads SET import_batch_id = ? WHERE id = ?`).run(batchId, lead.id);

      // Stage changes are written as history, so the timeline reads like a
      // lead somebody has actually worked rather than one that appeared.
      if (stage && seed.stage > 0) setLeadStage(db, lead.id, stage.id);

      if (seed.note) {
        const at = new Date(now.getTime() - (seed.spokeDaysAgo ?? 1) * 86_400_000);
        // writeActivity rather than logActivity: these are backdated, and
        // logActivity stamps the entry with the current time on purpose.
        writeActivity(db, {
          companyId,
          leadId: lead.id,
          kind: seed.spokeDaysAgo === undefined ? "note" : "call",
          body: seed.note,
          occurredAt: at.toISOString(),
        });
      }

      if (seed.spokeDaysAgo !== undefined) {
        const at = new Date(now.getTime() - seed.spokeDaysAgo * 86_400_000).toISOString();
        db.prepare(`UPDATE leads SET last_contacted_at = ?, updated_at = ? WHERE id = ?`).run(
          at,
          at,
          lead.id,
        );

        // The lead has to have been created before it was last spoken to, and
        // its "created" and stage-change entries have to move with it. They
        // are stamped at the moment of seeding otherwise, which counts as a
        // touch - and the lead meant to look neglected looks brand new.
        const born = new Date(
          now.getTime() - (seed.spokeDaysAgo + 5) * 86_400_000,
        ).toISOString();

        db.prepare(`UPDATE leads SET created_at = ? WHERE id = ?`).run(born, lead.id);
        db.prepare(
          `UPDATE activities SET occurred_at = ?, created_at = ?
            WHERE lead_id = ? AND occurred_at > ?`,
        ).run(born, born, lead.id, at);
      }

      if (seed.task) {
        createTask(
          db,
          companyId,
          taskInput.parse({
            leadId: lead.id,
            title: seed.task.title,
            kind: seed.task.kind,
            dueOn: shiftDay(day, seed.task.inDays),
          }),
        );
      }
    }

    // One task already done, so the history shows what a worked lead looks
    // like rather than only what an untouched one does.
    const first = db
      .prepare(`SELECT id FROM leads WHERE import_batch_id = ? ORDER BY rowid LIMIT 1`)
      .get(batchId) as { id: string } | undefined;

    if (first) {
      const done = createTask(
        db,
        companyId,
        taskInput.parse({
          leadId: first.id,
          title: "Send the first introduction",
          kind: "email",
          dueOn: shiftDay(day, -5),
        }),
      );
      completeTask(db, done.id);
    }

    return batchId;
  })();
}

/** The sample batch for a company, if one was seeded and not yet removed. */
export function findDemoBatch(db: Db, companyId: string): string | null {
  const row = db
    .prepare(
      `SELECT id FROM import_batches
        WHERE company_id = ? AND filename = ? AND undone_at IS NULL
        ORDER BY created_at DESC LIMIT 1`,
    )
    .get(companyId, DEMO_FILENAME) as { id: string } | undefined;

  return row?.id ?? null;
}

function companyTimezone(db: Db, companyId: string): string {
  const row = db.prepare(`SELECT timezone FROM companies WHERE id = ?`).get(companyId) as
    | { timezone: string }
    | undefined;
  return row?.timezone ?? "UTC";
}
