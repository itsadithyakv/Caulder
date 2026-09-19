import type { Db } from "../db/connection";
import type { Board, BoardCard, BoardColumn, StageKind } from "@shared/domain";
import { listStages } from "../repositories/companies";

/**
 * The pipeline board: one card per deal.
 *
 * One query for the cards, then grouping in memory. At this app's scale that is
 * a single pass over a few hundred rows, and it keeps the per-column totals
 * honest: a count and a value that come from the same read cannot disagree with
 * the cards shown beneath them.
 */

/**
 * How many cards a column renders.
 *
 * Won and Lost grow without limit and nobody scrolls two years of closed deals,
 * so every column shows the most recently touched and says how many more there
 * are. The count above the column is always the true total.
 */
const CARDS_PER_COLUMN = 100;

type CardRow = {
  id: string;
  lead_id: string;
  title: string;
  stage_id: string | null;
  name: string;
  city: string | null;
  contact_person: string | null;
  value: number | null;
  last_contacted_at: string | null;
  updated_at: string;
  open_tasks: number;
  do_not_contact: number;
};

export function buildBoard(db: Db, companyId: string): Board {
  const stages = listStages(db, companyId);

  const rows = db
    .prepare(
      // The open-task count is what puts the "next step planned" mark on a
      // card, so it is read here rather than in a second query per card.
      // A card is a deal; what it says about being in touch and what is
      // planned comes from its contact, which is where calls and tasks live.
      `SELECT
         d.id, d.lead_id, d.title, d.stage_id, l.name, l.city, l.contact_person, d.value,
         l.last_contacted_at, d.updated_at, l.do_not_contact,
         (SELECT COUNT(*) FROM tasks t
          WHERE t.lead_id = l.id AND t.status = 'open') AS open_tasks
       FROM deals d
       JOIN leads l ON l.id = d.lead_id
       WHERE d.company_id = ?
       ORDER BY d.updated_at DESC`,
    )
    .all(companyId) as CardRow[];

  const byStage = new Map<string, CardRow[]>();
  for (const row of rows) {
    // Null is a real bucket: deleting a stage nulls its leads rather than
    // deleting them, and they must still be somewhere you can see and move.
    const key = row.stage_id ?? "";
    const list = byStage.get(key);
    if (list) list.push(row);
    else byStage.set(key, [row]);
  }

  const columns: BoardColumn[] = stages.map((stage) =>
    toColumn(stage.id, stage.name, stage.kind, byStage.get(stage.id) ?? []),
  );

  // Everything no column claimed. Normally that is just stage_id IS NULL,
  // which is what deleting a stage leaves behind. But a lead pointing at a
  // stage that is not this company's would otherwise be in no bucket at all
  // and disappear from the board silently, which is the worst way for a lead
  // to go missing. The board's job is to show every lead in the company, so
  // anything unclaimed lands here.
  const claimed = new Set(stages.map((stage) => stage.id));
  const unstaged = [...byStage.entries()]
    .filter(([key]) => !claimed.has(key))
    .flatMap(([, list]) => list);

  if (unstaged.length > 0) {
    columns.push(toColumn(null, "Unstaged", "open", unstaged));
  }

  return { columns };
}

function toColumn(
  stageId: string | null,
  name: string,
  kind: StageKind,
  rows: CardRow[],
): BoardColumn {
  return {
    stageId,
    name,
    kind,
    total: rows.length,
    // Leads with no value contribute nothing rather than counting as zero,
    // which would be indistinguishable from a genuinely worthless lead.
    value: rows.reduce((sum, row) => sum + (row.value ?? 0), 0),
    cards: rows.slice(0, CARDS_PER_COLUMN).map(toCard),
  };
}

function toCard(row: CardRow): BoardCard {
  return {
    id: row.id,
    leadId: row.lead_id,
    title: row.title,
    name: row.name,
    city: row.city,
    contactPerson: row.contact_person,
    value: row.value,
    lastContactedAt: row.last_contacted_at,
    hasNextStep: row.open_tasks > 0,
    doNotContact: row.do_not_contact === 1,
  };
}
