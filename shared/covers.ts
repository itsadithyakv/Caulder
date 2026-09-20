/**
 * Asking Open Library for a book's cover: the two addresses, and which of its
 * answers to believe. Pure, so that what is sent and what is trusted are both
 * written down and tested; the asking itself is in
 * electron/main/services/covers.ts.
 */

/**
 * What is sent: the title, and the series when there is one - "the lightning
 * thief" alone finds a dozen books, with "percy jackson" it finds the one.
 * Nothing else is in the address.
 */
export function coverSearchUrl(title: string, series: string | null): string {
  const query = new URLSearchParams({ title, limit: "5", fields: "title,cover_i,edition_count" });
  if (series && !title.toLowerCase().includes(series.toLowerCase())) query.set("q", series);
  return `https://openlibrary.org/search.json?${query.toString()}`;
}

/** Medium: about 180 pixels wide, which is more than a shelf tile shows. */
export function coverImageUrl(id: number): string {
  return `https://covers.openlibrary.org/b/id/${id}-M.jpg`;
}

const plain = (text: string) => text.toLowerCase().replace(/^(?:the|a|an)\s+/, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/**
 * The cover to use from a search's answer, or null.
 *
 * Only from a book whose title is the one asked about - Open Library's first
 * answer to "Dune" may be a study guide to it, and a wrong cover is worse than
 * a drawn one. Among those, the one with the most editions: that is the book
 * itself rather than somebody's summary of it.
 */
export function pickCover(answer: unknown, title: string): number | null {
  const docs = (answer as { docs?: unknown } | null)?.docs;
  if (!Array.isArray(docs)) return null;
  const wanted = plain(title);
  // The title itself first. Only failing that, one it is the start of - "Harry
  // Potter and the Goblet of Fire (Book 4)" - and never the other way round:
  // asked for "Dune", "Dune Messiah" is a different book.
  let best: { id: number; editions: number; exact: boolean } | null = null;
  for (const doc of docs as { title?: unknown; cover_i?: unknown; edition_count?: unknown }[]) {
    if (typeof doc.title !== "string" || typeof doc.cover_i !== "number" || doc.cover_i <= 0) continue;
    const found = plain(doc.title);
    const exact = found === wanted;
    if (!exact && !(found.startsWith(`${wanted} `) && /[([:]/.test(doc.title))) continue;
    const editions = typeof doc.edition_count === "number" ? doc.edition_count : 0;
    if (!best || (exact && !best.exact) || (exact === best.exact && editions > best.editions)) best = { id: doc.cover_i, editions, exact };
  }
  return best?.id ?? null;
}
