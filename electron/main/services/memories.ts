import type { Db } from "../db/connection";
import type { BrainSectionId } from "@shared/brain";
import { memoriesOf, trailsOf, type Memory } from "@shared/memories";
import { homeCompanyId } from "../repositories/companies";

/**
 * Everything the line has been told to remember, and whose brain it is in.
 *
 * Memories are yours rather than a company's - the line keeps them in your own
 * workspace whichever company is open - so they are read from there, and the
 * window is told which workspace that is so it can open the page in it.
 *
 * The journal is never read for them. Its pages can be sealed, a sealed body
 * is not text, and what is written there is not the line's to list anyway.
 */
export function allMemories(db: Db): { companyId: string | null; memories: Memory[]; trails: Record<string, string[]> } {
  const companyId = homeCompanyId(db);
  if (!companyId) return { companyId: null, memories: [], trails: {} };
  const pages = db
    .prepare(
      `SELECT id, title, section, body FROM brain_pages
        WHERE company_id = ? AND is_archived = 0 AND section <> 'journal' AND body LIKE '%\\_(____-__-__)\\_%' ESCAPE '\\'
        ORDER BY updated_at DESC`,
    )
    .all(companyId) as { id: string; title: string; section: BrainSectionId; body: string }[];
  // Where each of those pages hangs, which needs every page above them - not only the ones with memories on.
  const every = db
    .prepare(`SELECT id, title, body FROM brain_pages WHERE company_id = ? AND is_archived = 0 AND section <> 'journal'`)
    .all(companyId) as { id: string; title: string; body: string }[];
  const trails = trailsOf(every);
  return { companyId, memories: pages.flatMap(memoriesOf), trails: Object.fromEntries(pages.map((page) => [page.id, trails[page.id] ?? []])) };
}
