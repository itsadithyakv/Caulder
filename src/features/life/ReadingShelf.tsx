import { useEffect, useState } from "react";
import { BookOpen, Check, Trash2 } from "lucide-react";
import type { ShelfStatus } from "@shared/books";
import type { Shelf, ShelfBook } from "@shared/tracker";
import { Card } from "@/components/Card";
import { messageOf } from "@/lib/errors";

/**
 * The reading shelf: what is being read, what is to be read, what has been.
 *
 * Filled from the quick line - "i am reading dune", "i want to read the percy
 * jackson series" - and kept in three piles, a series together and in order.
 *
 * The covers are drawn here unless real ones are asked for. A colour and the
 * title's initials, the same every time for the same book, so the shelf looks
 * like a shelf without anybody on the internet being told what is on it.
 *
 * Real covers are a switch on this card, off until pressed, and the switch
 * says what it does: the title of each book is sent to Open Library, once, to
 * find its picture. Main does the asking and keeps the picture, so this
 * window loads nothing from the internet either way (covers.ts).
 */

const PILES: readonly { status: ShelfStatus; key: keyof Shelf; title: string }[] = [
  { status: "reading", key: "reading", title: "Reading" },
  { status: "to-read", key: "toRead", title: "To be read" },
  { status: "read", key: "read", title: "Read" },
];

/** The same colour for the same title, from round the wheel: a hue from the letters. */
function hueOf(title: string): number {
  let sum = 0;
  for (const letter of title) sum = (sum * 31 + letter.charCodeAt(0)) % 360;
  return sum;
}

const initials = (title: string) =>
  title
    .split(/\s+/)
    .filter((word) => !/^(?:the|a|an|of|and|in|on|to|for)$/i.test(word))
    .slice(0, 3)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");

export function ReadingShelf({ companyId, version = 0 }: { companyId: string; version?: number }) {
  const [shelf, setShelf] = useState<Shelf | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [covers, setCovers] = useState(false);
  const [finding, setFinding] = useState(false);

  useEffect(() => {
    let live = true;
    window.caulder.life.shelf(companyId).then(
      (next) => live && setShelf(next),
      (cause: unknown) => live && setError(messageOf(cause)),
    );
    return () => {
      live = false;
    };
  }, [companyId, version]);

  useEffect(() => {
    window.caulder.life.covers().then(setCovers, () => undefined);
  }, []);

  // With covers on, a few of the books without one are looked up each time the
  // shelf is shown - and only then: never in the background, never with covers off.
  const books = shelf ? shelf.reading.length + shelf.toRead.length + shelf.read.length : 0;
  useEffect(() => {
    if (!covers || books === 0) return;
    let live = true;
    setFinding(true);
    window.caulder.life
      .fillCovers(companyId)
      .then((found) => {
        if (!live) return;
        setShelf(found.shelf);
        if (found.error) setError(found.error);
      }, () => undefined)
      .finally(() => live && setFinding(false));
    return () => {
      live = false;
    };
  }, [covers, companyId, books]);

  function toggleCovers() {
    setError(null);
    window.caulder.life.setCovers(!covers).then(
      async (now) => {
        setCovers(now);
        if (!now) setShelf(await window.caulder.life.shelf(companyId));
      },
      (cause: unknown) => setError(messageOf(cause)),
    );
  }

  const act = (work: () => Promise<Shelf>) => {
    setError(null);
    work().then(setShelf, (cause: unknown) => setError(messageOf(cause)));
  };

  if (!shelf) return error ? <p className="field__error" role="alert">{error}</p> : null;
  const empty = shelf.reading.length + shelf.toRead.length + shelf.read.length === 0;

  return (
    <Card
      icon={<BookOpen size={15} aria-hidden />}
      title="Reading"
      hint={empty ? "Tell the line on Today: “i am reading dune”, “i want to read the percy jackson series”." : undefined}
    >
      {PILES.filter((pile) => shelf[pile.key].length > 0).map((pile) => (
        <section key={pile.status} className="shelf" aria-label={pile.title}>
          <h3 className="shelf__title">
            {pile.title} <span className="shelf__count">{shelf[pile.key].length}</span>
          </h3>
          <ul className="shelf__books">
            {shelf[pile.key].map((book) => (
              <Book
                key={book.id}
                book={book}
                onMove={(status) => act(() => window.caulder.life.shelfMove(book.id, status))}
                onRemove={() => act(() => window.caulder.life.shelfRemove(book.id))}
              />
            ))}
          </ul>
        </section>
      ))}
      {error && <p className="field__error" role="alert">{error}</p>}
      {!empty && (
        <label className="shelf__covers">
          <input type="checkbox" checked={covers} onChange={toggleCovers} />
          <span>
            Show real covers.{" "}
            <span className="shelf__coversNote">
              {covers
                ? finding
                  ? "Looking for them at Open Library…"
                  : "Each title was sent to openlibrary.org once to find its picture, which is kept here. Switch off to stop and to drop them."
                : "Sends the title of each book on this shelf to openlibrary.org, once, to find its picture. Nothing else is sent. Off, Caulder draws them."}
            </span>
          </span>
        </label>
      )}
    </Card>
  );
}

function Book({ book, onMove, onRemove }: { book: ShelfBook; onMove: (status: ShelfStatus) => void; onRemove: () => void }) {
  const next: ShelfStatus | null = book.status === "to-read" ? "reading" : book.status === "reading" ? "read" : null;
  return (
    <li className="book">
      {book.cover ? (
        <img className="book__cover book__cover--real" src={book.cover} alt="" />
      ) : (
        <span className="book__cover" style={{ "--book-hue": hueOf(book.title) } as React.CSSProperties} aria-hidden>
          {initials(book.title)}
        </span>
      )}
      <span className="book__title">{book.title}</span>
      {book.series && <span className="book__series">{book.series}</span>}
      <span className="book__actions">
        {next && (
          <button type="button" className="btn btn--sm btn--ghost" onClick={() => onMove(next)} title={next === "reading" ? "Start reading" : "Finished"}>
            <Check size={13} aria-hidden />
            {next === "reading" ? "Start" : "Finished"}
          </button>
        )}
        <button type="button" className="btn btn--sm btn--ghost btn--danger" onClick={onRemove} aria-label={`Take "${book.title}" off the shelf`}>
          <Trash2 size={13} aria-hidden />
        </button>
      </span>
    </li>
  );
}
