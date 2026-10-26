import type { Db } from "../db/connection";
import { createCompany, homeCompanyId } from "../repositories/companies";
import { findDemoBatch } from "./demo";

/**
 * The calendar's own workspace.
 *
 * A class, the gym and a term are not a company's, and they are what a call
 * is planned around, so they are kept in a workspace of the personal kind
 * whichever company is chosen. **It is never a second workspace to choose**:
 * the switcher leaves it out, nothing asks which half you are in, and Today
 * and the Calendar read it beside the company (`withHome`).
 *
 * It used to hold the personal half of the app as well - the journal, Life,
 * habits, memories. That half went on 10 October 2026 (PLAN.md, part seven,
 * migration 49), and only the calendar's things are left in it.
 *
 * Run at start-up and whenever a company is made, and a no-op once done:
 * with a home already there, or before there is any real company (looking
 * around the sample data), it does nothing.
 */

/** What is kept per workspace outright and is not a company's, moved whole. */
const YOURS_WHOLE = ["terms"] as const;

export function ensureHome(db: Db): { home: string | null; moved: number } {
  const personal = db.prepare(`SELECT id FROM companies WHERE kind = 'personal' AND is_archived = 0 LIMIT 1`).get() as { id: string } | undefined;
  if (personal) return { home: personal.id, moved: 0 };

  // A company that is real, not the sample one being looked round: before it, there is nothing of yours to keep apart.
  const companies = db.prepare(`SELECT id, accent, timezone, country, currency FROM companies WHERE is_archived = 0 ORDER BY created_at, rowid`).all() as {
    id: string;
    accent: string;
    timezone: string;
    country: string | null;
    currency: string;
  }[];
  const real = companies.filter((company) => findDemoBatch(db, company.id) === null);
  if (real.length === 0) return { home: null, moved: 0 };

  // Where your things are now: the old home - unless that is the sample company, whose pages go with it.
  const was = homeCompanyId(db);
  const from = was && real.some((company) => company.id === was) ? was : null;
  const like = companies.find((company) => company.id === (from ?? real[0]?.id)) ?? real[0]!;

  return db.transaction(() => {
    const home = createCompany(db, {
      name: "Me",
      accent: "coffee",
      timezone: like.timezone,
      kind: "personal",
      country: like.country,
      currency: like.currency,
    }).id;
    if (!from) return { home, moved: 0 };

    const move = (sql: string, ...args: unknown[]) => db.prepare(sql).run(...args).changes;
    let moved = 0;
    for (const table of YOURS_WHOLE) moved += move(`UPDATE ${table} SET company_id = ? WHERE company_id = ?`, home, from);
    return { home, moved };
  })();
}
