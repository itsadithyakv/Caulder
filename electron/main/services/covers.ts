import { net } from "electron";
import type { Db } from "../db/connection";
import { getSetting, setSetting } from "../repositories/settings";
import { coverSearchUrl, coverImageUrl, pickCover } from "@shared/covers";
import { shelf } from "./tracker";
import type { Shelf } from "@shared/tracker";

/**
 * Book covers, from Open Library - and only when asked for.
 *
 * Caulder asks nobody on the internet anything unless it has been told to,
 * and this is the second thing it can be told to ask (the Google script is
 * the first). Off until switched on in the Reading card, which says what
 * switching it on means: **the title of each book on the shelf is sent to
 * openlibrary.org**, once, to find its cover. Nothing else is - not who is
 * asking, not which pile it is on, not the rest of the shelf.
 *
 * Once found, a cover is kept in the database as the picture itself, so it is
 * asked for once and the window never loads anything from the internet: the
 * page's content policy allows no remote images, and does not have to change.
 * A book with no cover found keeps the one Caulder draws, and is not asked
 * about again.
 */

const TIMEOUT_MS = 12_000;
/** Small covers are a few tens of kilobytes; anything much bigger is not what was asked for. */
const MAX_BYTES = 400 * 1024;
/** A few at a time: a long shelf fills in over a few visits rather than in one burst of requests. */
const PER_VISIT = 8;
/** Kept in place of a cover for a book Open Library has none for, so it is asked about once. */
const NONE = "none";

export function coversOn(db: Db): boolean {
  return getSetting(db, "shelfCovers") === "on";
}

export function setCovers(db: Db, on: unknown): boolean {
  setSetting(db, "shelfCovers", on === true ? "on" : "");
  return coversOn(db);
}

async function get(url: string): Promise<Response> {
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), TIMEOUT_MS);
  try {
    return await net.fetch(url, { signal: stop.signal, headers: { "User-Agent": "Caulder (desktop app; book covers)" } });
  } finally {
    clearTimeout(timer);
  }
}

/** One title's cover as a picture to keep, or null when there is none to be had. */
async function coverFor(title: string, series: string | null): Promise<string | null> {
  const found = await get(coverSearchUrl(title, series));
  if (!found.ok) throw new Error(`Open Library answered ${found.status}.`);
  const id = pickCover((await found.json()) as unknown, title);
  if (id === null) return null;

  const image = await get(coverImageUrl(id));
  if (!image.ok) return null;
  const type = image.headers.get("content-type") ?? "";
  const bytes = Buffer.from(await image.arrayBuffer());
  if (!/^image\/(?:jpeg|png|webp)$/.test(type) || bytes.length === 0 || bytes.length > MAX_BYTES) return null;
  return `data:${type};base64,${bytes.toString("base64")}`;
}

/**
 * Finds covers for the books that have none yet. Asked for by the Reading
 * card when it is shown, never in the background; does nothing at all while
 * covers are off. A failure - no network, Open Library down - leaves the shelf
 * as it was, to be tried again next time, and is said rather than thrown.
 */
export async function fillCovers(db: Db, companyId: string): Promise<{ shelf: Shelf; error: string | null }> {
  if (!coversOn(db)) return { shelf: shelf(db, companyId), error: null };
  const missing = db
    .prepare(`SELECT id, title, series FROM shelf_books WHERE company_id = ? AND cover IS NULL ORDER BY created_at LIMIT ?`)
    .all(companyId, PER_VISIT) as { id: string; title: string; series: string | null }[];

  let error: string | null = null;
  for (const book of missing) {
    try {
      const cover = await coverFor(book.title, book.series);
      db.prepare(`UPDATE shelf_books SET cover = ? WHERE id = ?`).run(cover ?? NONE, book.id);
    } catch (cause) {
      error = `Could not reach Open Library for covers${cause instanceof Error && cause.name !== "AbortError" ? `: ${cause.message}` : "."} The shelf is as it was.`;
      break;
    }
  }
  return { shelf: shelf(db, companyId), error };
}

/** Covers switched off for good: the ones already fetched go too, so off means none are kept. */
export function forgetCovers(db: Db): void {
  db.prepare(`UPDATE shelf_books SET cover = NULL`).run();
}
