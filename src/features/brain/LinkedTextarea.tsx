import { useEffect, useId, useRef, useState } from "react";
import { Link2 } from "lucide-react";
import { linkToken, openLinkQuery, type LinkTarget } from "@shared/links";
import { isSection, sectionOf } from "@shared/brain";
import { mapKindOf } from "@shared/map";

/**
 * A page's text box that knows about links.
 *
 * Typing `[[` opens a list, at the cursor, of the pages and contacts whose
 * names contain what follows; arrows move, Enter or Tab puts the link in,
 * Escape closes the list and nothing else. The link goes into the text by id
 * (shared/links.ts), so renaming what it points at never breaks it.
 */

/** Everything about a textarea's text layout a copy needs to wrap the same way. */
const MIRRORED = [
  "box-sizing",
  "width",
  "border-top-width",
  "border-right-width",
  "border-bottom-width",
  "border-left-width",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "font-style",
  "font-variant",
  "font-weight",
  "font-stretch",
  "font-size",
  "line-height",
  "font-family",
  "text-align",
  "text-transform",
  "text-indent",
  "letter-spacing",
  "word-spacing",
  "tab-size",
];

/** Where the caret sits inside a textarea, in pixels from its top-left corner. */
function caretPoint(area: HTMLTextAreaElement, position: number): { top: number; left: number } {
  const style = getComputedStyle(area);
  const copy = document.createElement("div");
  for (const name of MIRRORED) copy.style.setProperty(name, style.getPropertyValue(name));
  copy.style.position = "absolute";
  copy.style.visibility = "hidden";
  copy.style.top = "0";
  copy.style.left = "-9999px";
  copy.style.whiteSpace = "pre-wrap";
  copy.style.overflowWrap = "break-word";
  copy.textContent = area.value.slice(0, position);
  const marker = document.createElement("span");
  marker.textContent = String.fromCharCode(0x200b);
  copy.appendChild(marker);
  document.body.appendChild(copy);
  const line = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.5;
  const point = {
    top: marker.offsetTop - area.scrollTop + line + 4,
    left: Math.min(marker.offsetLeft - area.scrollLeft, area.clientWidth - 280),
  };
  copy.remove();
  return { top: point.top, left: Math.max(0, point.left) };
}

/** A page's section says what kind of dot it is; a contact is a contact. */
function kindOf(target: LinkTarget) {
  return mapKindOf(target.kind, target.kind === "page" && isSection(target.detail) ? target.detail : null);
}

/** Beside each name: its section, or what else is known of it - a contact's city, a person's role. */
function describe(target: LinkTarget): string {
  if (target.kind === "page") return isSection(target.detail) ? sectionOf(target.detail).label : "Page";
  const kind = { contact: "Contact", product: "Product", person: "Person", document: "Document" }[target.kind];
  return target.detail ? `${kind} · ${target.detail}` : kind;
}

export function LinkedTextarea({
  id,
  companyId,
  exclude,
  value,
  disabled,
  onChange,
  className,
}: {
  id: string;
  companyId: string;
  /** This page, which cannot link to itself. */
  exclude: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  className: string;
}) {
  const area = useRef<HTMLTextAreaElement>(null);
  const listId = useId();
  const [open, setOpen] = useState<{ start: number; query: string; caret: number } | null>(null);
  const [targets, setTargets] = useState<LinkTarget[]>([]);
  const [active, setActive] = useState(0);
  const [point, setPoint] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!open) return;
    let live = true;
    const timer = setTimeout(() => {
      window.caulder.brain
        .linkTargets(companyId, open.query)
        .then((found) => {
          if (!live) return;
          setTargets(found.filter((target) => !(target.kind === "page" && target.id === exclude)));
          setActive(0);
        })
        .catch(() => live && setTargets([]));
    }, 60);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [open, companyId, exclude]);

  /** Reads where the caret is and whether it is inside an unfinished link. */
  function look() {
    const element = area.current;
    if (!element) return;
    const caret = element.selectionStart;
    const found = element.selectionStart === element.selectionEnd ? openLinkQuery(element.value, caret) : null;
    if (!found) {
      setOpen(null);
      return;
    }
    setOpen((current) =>
      current && current.start === found.start && current.query === found.query && current.caret === caret
        ? current
        : { ...found, caret },
    );
    setPoint(caretPoint(element, found.start));
  }

  function choose(target: LinkTarget | undefined) {
    const element = area.current;
    if (!target || !open || !element) return;
    const token = linkToken(target.name, target);
    const next = value.slice(0, open.start) + token + value.slice(open.caret);
    const caret = open.start + token.length;
    onChange(next);
    setOpen(null);
    requestAnimationFrame(() => {
      element.focus();
      element.setSelectionRange(caret, caret);
    });
  }

  /** The toolbar's way in: types the brackets and opens the list. */
  function startLink() {
    const element = area.current;
    if (!element) return;
    const at = element.selectionStart;
    const next = `${value.slice(0, at)}[[${value.slice(element.selectionEnd)}`;
    onChange(next);
    requestAnimationFrame(() => {
      element.focus();
      element.setSelectionRange(at + 2, at + 2);
      look();
    });
  }

  const showing = open !== null;

  return (
    <div className="linkfield">
      <div className="linkfield__bar">
        <button type="button" className="btn btn--sm btn--ghost" onClick={startLink} disabled={disabled}>
          <Link2 size={14} aria-hidden />
          Link to a page or contact
        </button>
        <span className="field__hint">or type [[</span>
      </div>
      <div className="linkfield__box">
        <textarea
          ref={area}
          id={id}
          className={className}
          value={value}
          disabled={disabled}
          spellCheck
          role="combobox"
          aria-expanded={showing}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showing && targets.length > 0 ? `${listId}-${active}` : undefined}
          onChange={(event) => {
            onChange(event.target.value);
            requestAnimationFrame(look);
          }}
          onClick={look}
          onKeyUp={(event) => {
            if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) look();
          }}
          onBlur={() => setTimeout(() => setOpen(null), 120)}
          onKeyDown={(event) => {
            if (!showing) return;
            if (event.key === "Escape") {
              event.preventDefault();
              setOpen(null);
            } else if (targets.length === 0) {
              return;
            } else if (event.key === "ArrowDown") {
              event.preventDefault();
              setActive((index) => Math.min(targets.length - 1, index + 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActive((index) => Math.max(0, index - 1));
            } else if (event.key === "Enter" || event.key === "Tab") {
              event.preventDefault();
              choose(targets[active]);
            }
          }}
        />
        {showing && (
          <ul
            className="linkfield__list anim-spring"
            id={listId}
            role="listbox"
            aria-label="Link to"
            style={{ top: point.top, left: point.left }}
          >
            {targets.length === 0 ? (
              <li className="linkfield__empty">
                {open.query.trim() ? "No page or contact by that name." : "Type part of a name."}
              </li>
            ) : (
              targets.map((target, index) => (
                <li
                  key={`${target.kind}:${target.id}`}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={index === active}
                  className={`linkfield__option${index === active ? " linkfield__option--active" : ""}`}
                  onMouseDown={(event) => {
                    // Before the textarea loses focus and closes the list.
                    event.preventDefault();
                    choose(target);
                  }}
                  onMouseMove={() => setActive(index)}
                >
                  <span className={`mapdot mapdot--${kindOf(target)}`} aria-hidden />
                  <span className="linkfield__name">{target.name}</span>
                  <span className="linkfield__kind">{describe(target)}</span>
                </li>
              ))
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
