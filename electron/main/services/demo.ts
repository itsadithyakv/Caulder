import { randomUUID } from "node:crypto";
import type { Db } from "../db/connection";
import { createLead, setLeadStage, writeActivity } from "../repositories/leads";
import { createTask, completeTask } from "../repositories/tasks";
import { createBlock } from "../repositories/blocks";
import { addPayment, saveInvoice, saveQuote, setInvoiceStatus, setQuoteStatus } from "../repositories/money";
import { listStages } from "../repositories/companies";
import { leadInput, taskInput, type PipelineStage } from "@shared/domain";
import { shiftDay, today as todayIn } from "@shared/dates";
import { linkToken } from "@shared/links";
import { createPage } from "../repositories/brain";
import { entryTitle, makeTime } from "./life";

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
  /**
   * Where in the funnel. A number is an index into the seeded stages; "won"
   * and "lost" are looked up by what the stage MEANS, because those two are
   * the ones whose position moves as soon as anybody edits their funnel - and
   * a sample where the signed lead sits under "Proposal sent" teaches the
   * wrong thing about the app.
   */
  stage: number | "won" | "lost";
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
    stage: "won",
    spokeDaysAgo: 9,
    note: "Signed. Rollout starts after the term break.",
  },
  {
    name: "Sunrise Academy",
    contactPerson: "P Sharma",
    email: "p.sharma@sunrise.example.in",
    city: "Mysuru",
    stage: "lost",
    spokeDaysAgo: 15,
    note: "Went with a competitor on price. Worth another look next year.",
  },
];

/**
 * Seeds the sample and returns the batch id, which is how it is removed again.
 * One transaction: a half-seeded sample is worse than none.
 */
/**
 * The stages a sample lead is walked through on its way to where it ends up.
 *
 * Won and Lost are parallel ends of the funnel, not steps in it, so a lost
 * deal must not be dragged through Won to reach Lost - which is what a plain
 * slice of the stage list does, and which made every stage in the sample
 * report exactly the same conversion rate.
 *
 * A lost deal also stops partway rather than reaching the last open stage. A
 * funnel where every deal gets a proposal has no shape to show.
 */
/** One student founder's Tuesday, on whichever day the sample is looked at. */
const SAMPLE_BLOCKS: { startsAt: string; minutes: number; title: string; kind: string }[] = [
  { startsAt: "09:00", minutes: 120, title: "Data structures lecture", kind: "class" },
  { startsAt: "11:30", minutes: 60, title: "Reading for Friday", kind: "study" },
  { startsAt: "14:00", minutes: 30, title: "Call with Bengaluru Public School", kind: "meeting" },
  { startsAt: "15:00", minutes: 90, title: "Proposal for Oakridge", kind: "focus" },
  { startsAt: "18:00", minutes: 60, title: "Gym", kind: "personal" },
];

function walkTo(stages: PipelineStage[], target: PipelineStage): PipelineStage[] {
  const open = stages.filter((stage) => stage.kind === "open");

  if (target.kind === "open") {
    return open.slice(0, open.indexOf(target) + 1);
  }

  const depth = target.kind === "won" ? open.length : Math.ceil(open.length / 2);
  return [...open.slice(0, depth), target];
}

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
      const stage =
        typeof seed.stage === "number"
          ? stages[Math.min(seed.stage, stages.length - 1)]
          : (stages.find((candidate) => candidate.kind === seed.stage) ??
            stages[stages.length - 1]);
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

      // Walked through the funnel rather than dropped at the end of it.
      //
      // createLead already puts the contact's deal in its target stage, so a
      // single move to that same stage returns early and writes nothing - the
      // sample data had a Won deal with no record of ever having been
      // anywhere, and the forecast, which learns from what stages a deal
      // passed through, had nothing at all to count.
      if (stage) {
        const path = walkTo(stages, stage);
        db.prepare(`UPDATE deals SET stage_id = ? WHERE lead_id = ?`).run(
          path[0]?.id ?? null,
          lead.id,
        );
        // Written, not moved: the built-in follow-up must not fire on history.
        for (const step of path.slice(1)) setLeadStage(db, lead.id, step.id, { followUp: false });
      }

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
        db.prepare(`UPDATE deals SET created_at = ? WHERE lead_id = ?`).run(born, lead.id);
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

    // A day with hours in it, so the calendar half has something to show as
    // well: a lecture, a client call in the afternoon and the gym after. Not
    // part of the import batch, because blocks are not leads - the sample
    // company goes as a whole when the real one is created.
    for (const block of SAMPLE_BLOCKS) {
      createBlock(db, companyId, { day, ...block });
    }

    // And some money, so the Money screen has a shape: one invoice paid, one
    // sent and due soon, one quote out. Cheap to seed, and the whole point of
    // looking around is seeing every screen with something on it.
    const leadNamed = (name: string) =>
      (
        db.prepare(`SELECT id FROM leads WHERE import_batch_id = ? AND name = ?`).get(batchId, name) as
          | { id: string }
          | undefined
      )?.id;
    const won = leadNamed("Prajna Vahini School");
    const meeting = leadNamed("Oakridge International School");
    const contacted = leadNamed("GIG International School");
    if (won) {
      const paid = saveInvoice(db, companyId, null, {
        leadId: won,
        issuedOn: shiftDay(day, -12),
        dueOn: shiftDay(day, 2),
        notes: null,
        lines: [{ description: "Attendance module, annual", quantity: 1, unitPrice: 60000 }],
      });
      setInvoiceStatus(db, companyId, paid.id, "sent");
      addPayment(db, companyId, paid.id, { amount: 60000, paidOn: shiftDay(day, -3), note: null });
    }
    if (meeting) {
      const open = saveInvoice(db, companyId, null, {
        leadId: meeting,
        issuedOn: shiftDay(day, -2),
        dueOn: shiftDay(day, 12),
        notes: "Half up front, half on go-live.",
        lines: [{ description: "Pilot, one term", quantity: 1, unitPrice: 125000 }],
      });
      setInvoiceStatus(db, companyId, open.id, "sent");
    }
    if (contacted) {
      const quote = saveQuote(db, companyId, null, {
        leadId: contacted,
        issuedOn: shiftDay(day, -1),
        notes: null,
        lines: [
          { description: "Attendance module, annual", quantity: 1, unitPrice: 60000 },
          { description: "Onboarding day", quantity: 1, unitPrice: 20000 },
        ],
      });
      setQuoteStatus(db, companyId, quote.id, "sent");
    }

    // And the half of a student founder's life that is not the company: a
    // course with an exam coming, a hobby with evenings set aside for it, a
    // goal part of the way there, and two days of the journal - so the
    // brain's own sections, Today's journal card and the Calendar's evenings
    // have something in them too.
    const at = now.toISOString();
    const course = createPage(
      db,
      companyId,
      {
        section: "studies",
        template: "course",
        title: "Data structures",
        body: `## What it covers\n\nTrees, graphs, and how fast things get as they grow.\n\n## Assignments\n\n- [ ] Problem set 3 (by ${shiftDay(day, 6)})\n- [ ] Read chapter 5\n`,
        fields: { code: "CS2101", term: "Semester 3", credits: 4, status: "taking" },
      },
      at,
    );
    createPage(
      db,
      companyId,
      {
        section: "studies",
        template: "exam",
        title: "Data structures midterm",
        body: `For ${linkToken("Data structures", { kind: "page", id: course })}.\n\n## To revise\n\n- [ ] Trees and heaps\n- [ ] Graph search\n`,
        fields: { examOn: shiftDay(day, 12), at: "09:30, LT-2" },
      },
      at,
    );
    const hobby = createPage(
      db,
      companyId,
      {
        section: "hobbies",
        template: "hobby",
        title: "Guitar",
        body: "## Why I do it\n\nIt is the one hour nothing else gets into.\n",
        fields: { status: "doing-it", hoursWanted: 3, goal: "Five songs, start to finish" },
      },
      at,
    );
    makeTime(db, hobby, { weekdays: [2, 5], startsAt: "20:00", minutes: 45, until: shiftDay(day, 56) }, now);
    createPage(
      db,
      companyId,
      {
        section: "goals",
        template: "life-goal",
        title: "Read 12 books this year",
        body: "## Why it matters\n\nA founder who reads is a founder who borrows other people's mistakes.\n",
        fields: { area: "personal", target: 12, progress: 4, unit: "books", byOn: `${day.slice(0, 4)}-12-31` },
      },
      at,
    );
    const entries: [number, string, string][] = [
      [2, "okay", "Two lectures and a quiet afternoon. Oakridge still has not written back."],
      [1, "good", "Prajna Vahini paid. Played for forty minutes after dinner without looking at the phone."],
    ];
    for (const [ago, mood, words] of entries) {
      const on = shiftDay(day, -ago);
      createPage(
        db,
        companyId,
        {
          section: "journal",
          template: "entry",
          title: entryTitle(on),
          body: `## Today\n\n${words}\n\n## Grateful for\n\n\n## Tomorrow\n\n`,
          fields: { day: on, mood },
        },
        at,
      );
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
