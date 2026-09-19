import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Search } from "lucide-react";
import { sectionOf } from "@shared/brain";
import { MARK_CLOSE, MARK_OPEN, SEARCH_KIND_LABEL, type SearchHit } from "@shared/search";
import { messageOf } from "@/lib/errors";

/**
 * Search everything, on Ctrl+K: pages, contacts, notes, history and invoices
 * in one list, best match first, with what each one is written beside it.
 *
 * Built to the combobox pattern like the app's own dropdown: the cursor stays
 * in the box, the arrows move the highlighted result, Enter opens it.
 */

/** Long enough to skip the keystrokes in the middle of a word. */
const DEBOUNCE_MS = 90;

export function SearchPalette({
  companyId,
  onOpen,
  onClose,
}: {
  companyId: string;
  onOpen: (hit: SearchHit) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [active, setActive] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();

  useEffect(() => input.current?.focus(), []);

  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      window.caulder.brain
        .search(companyId, text)
        .then((found) => {
          if (!live) return;
          setHits(found);
          setActive(0);
          setError(null);
        })
        .catch((cause: unknown) => live && setError(messageOf(cause)));
    }, text.length === 0 ? 0 : DEBOUNCE_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [companyId, text]);

  function choose(hit: SearchHit | undefined) {
    if (!hit) return;
    onOpen(hit);
  }

  const optionId = (index: number) => `${listId}-${index}`;

  return (
    <div
      className="scrim anim-in palette__scrim"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="card palette anim-spring" role="dialog" aria-modal="true" aria-label="Search everything">
        <div className="palette__box">
          <Search size={18} className="palette__icon" aria-hidden />
          <input
            ref={input}
            className="palette__input"
            value={text}
            placeholder="Search pages, contacts, notes, history and invoices"
            role="combobox"
            aria-expanded={hits.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={hits.length > 0 ? optionId(active) : undefined}
            aria-label="Search everything"
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActive((index) => Math.min(hits.length - 1, index + 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActive((index) => Math.max(0, index - 1));
              } else if (event.key === "Enter") {
                event.preventDefault();
                choose(hits[active]);
              } else if (event.key === "Escape") {
                // Handled here, so the app's own Escape does not also act.
                event.preventDefault();
                onClose();
              }
            }}
          />
          <kbd className="kbd">Esc</kbd>
        </div>

        {error && (
          <p className="field__error" role="alert">
            {error}
          </p>
        )}

        <p className="palette__caption">
          {text.trim().length === 0
            ? hits.length > 0
              ? "Recently written in the brain"
              : "Type to search everything in this company."
            : hits.length === 0
              ? "Nothing matches. Try the start of a word."
              : `${hits.length} ${hits.length === 1 ? "match" : "matches"}`}
        </p>

        <ul className="palette__list" id={listId} role="listbox" aria-label="Results">
          {hits.map((hit, index) => (
            <li
              key={`${hit.kind}-${hit.id}`}
              id={optionId(index)}
              role="option"
              aria-selected={index === active}
              className={`palette__item${index === active ? " palette__item--active" : ""}`}
              onMouseMove={() => setActive(index)}
              onClick={() => choose(hit)}
            >
              <span className="palette__kind">
                {hit.kind === "page" && hit.section ? sectionOf(hit.section).label : SEARCH_KIND_LABEL[hit.kind]}
              </span>
              <span className="palette__text">
                <span className="palette__title">{hit.title || SEARCH_KIND_LABEL[hit.kind]}</span>
                {hit.detail && <span className="palette__detail">{highlighted(hit.detail)}</span>}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** The snippet with its matched words marked, as elements. */
function highlighted(detail: string): ReactNode[] {
  const out: ReactNode[] = [];
  let rest = detail;
  let key = 0;
  while (rest.length > 0) {
    const open = rest.indexOf(MARK_OPEN);
    if (open === -1) {
      out.push(rest);
      break;
    }
    if (open > 0) out.push(rest.slice(0, open));
    const close = rest.indexOf(MARK_CLOSE, open + 1);
    const end = close === -1 ? rest.length : close;
    out.push(<mark key={key++}>{rest.slice(open + 1, end)}</mark>);
    rest = close === -1 ? "" : rest.slice(close + 1);
  }
  return out;
}
