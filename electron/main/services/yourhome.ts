import type { Db } from "../db/connection";
import { PERSONAL_SQL } from "@shared/brain";
import { createCompany, homeCompanyId } from "../repositories/companies";
import { findDemoBatch } from "./demo";

/**
 * Your own things in a home of their own.
 *
 * You are not a company (PLAN.md, "After 0.3 - You, and the company chosen"):
 * the journal, Life, habits, the vision board and what the line remembers are
 * yours whichever company is chosen. They used to live in the first company
 * made, which was simple and wrong in three ways that showed - the company's
 * brain and map filled up with your guitar and your journal days, archiving
 * that company took your journal out of sight with it, and the sample
 * company's pages were yours until it was cleared.
 *
 * So there is a workspace of the personal kind, made here, and your things
 * moved into it once. **It is never a second workspace to choose**: the
 * switcher leaves it out while there is a company, nothing asks which half
 * you are in, and Plan and You read it exactly as they read home before -
 * `homeCompanyId` already prefers it. Only where things are kept changed.
 *
 * Run at start-up and whenever a company is made, and a no-op once done:
 * with a home of the personal kind already there, or before there is any
 * real company (looking around the sample data), it does nothing.
 */

/** Everything of yours that is kept per workspace outright, moved whole. */
const YOURS_WHOLE = ["journal_private", "habits", "hobby_logs", "shelf_books", "vision_tiles", "day_checkins", "day_themes", "terms"] as const;

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

    // Your pages: the personal sections, and what the line remembered into Ideas - its pages, not the company's ideas.
    const pages = (
      db
        .prepare(
          `SELECT id FROM brain_pages
            WHERE company_id = ? AND (
              section IN (${PERSONAL_SQL})
              OR (section = 'ideas' AND template = 'page' AND body LIKE '%\\_(____-__-__)\\_%' ESCAPE '\\')
            )`,
        )
        .all(from) as { id: string }[]
    ).map((row) => row.id);

    const move = (sql: string, ...args: unknown[]) => db.prepare(sql).run(...args).changes;
    let moved = 0;
    if (pages.length > 0) {
      const list = pages.map(() => "?").join(", ");
      moved += move(`UPDATE brain_pages SET company_id = ? WHERE id IN (${list})`, home, ...pages);
      // What they link to, where they are found, and where they were left on the map - with them.
      move(`UPDATE brain_links SET company_id = ? WHERE from_page IN (${list})`, home, ...pages);
      move(`UPDATE search_map SET company_id = ? WHERE kind = 'page' AND ref_id IN (${list})`, home, ...pages);
      move(`UPDATE map_positions SET company_id = ? WHERE company_id = ? AND node IN (${pages.map(() => "?").join(", ")})`, home, from, ...pages.map((id) => `page:${id}`));
      // The hours given to a hobby or a course, and the tasks a page made: where the page is, so Life still counts them.
      move(`UPDATE block_series SET company_id = ? WHERE page_id IN (${list})`, home, ...pages);
      move(`UPDATE blocks SET company_id = ? WHERE page_id IN (${list})`, home, ...pages);
      move(`UPDATE tasks SET company_id = ? WHERE page_id IN (${list})`, home, ...pages);
    }
    for (const table of YOURS_WHOLE) moved += move(`UPDATE ${table} SET company_id = ? WHERE company_id = ?`, home, from);
    return { home, moved };
  })();
}
