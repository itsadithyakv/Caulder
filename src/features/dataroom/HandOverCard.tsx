import { useEffect, useState } from "react";
import { BookOpen, FolderArchive, FolderOpen } from "lucide-react";
import {
  HANDBOOK_DEFAULTS,
  HANDBOOK_EXTRAS,
  ROOM_DEFAULTS,
  ROOM_EXTRAS,
  ROOM_EXTRA_LABEL,
  type RoomChoices,
  type RoomExtra,
} from "@shared/dataroom";
import { Card } from "@/components/Card";
import { ErrorLine } from "@/components/ErrorLine";
import { messageOf } from "@/lib/errors";

/**
 * The company handed to somebody else (PLAN.md, phase 13): a data room for an
 * investor, zipped with an index that opens in any browser, or a handbook for
 * somebody joining, printed as one PDF. What goes in is ticked, starting from
 * what each is usually for; nothing is ticked that has nothing in it.
 */

type Mode = "room" | "handbook";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function HandOverCard({ companyId, version }: { companyId: string; version: number }) {
  const [choices, setChoices] = useState<RoomChoices | null>(null);
  const [mode, setMode] = useState<Mode | null>(null);
  const [sections, setSections] = useState<Set<string>>(new Set());
  const [categories, setCategories] = useState<Set<string>>(new Set());
  const [extras, setExtras] = useState<Set<RoomExtra>>(new Set());
  const [secrets, setSecrets] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ which: Mode; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    window.caulder.room.choices(companyId).then(
      (next) => live && setChoices(next),
      (cause: unknown) => live && setError(messageOf(cause)),
    );
    return () => {
      live = false;
    };
  }, [companyId, version]);

  function start(next: Mode) {
    if (!choices) return;
    setMode(next);
    setDone(null);
    setError(null);
    const defaults = next === "room" ? ROOM_DEFAULTS : { ...HANDBOOK_DEFAULTS, categories: [] };
    setSections(new Set(defaults.sections.filter((id) => (choices.sections.find((s) => s.id === id)?.pages ?? 0) > 0)));
    setCategories(
      new Set(
        defaults.categories.filter((id) => {
          const found = choices.categories.find((c) => c.id === id);
          return found ? found.files + found.written > 0 : false;
        }),
      ),
    );
    setExtras(new Set(defaults.extras.filter((id) => choices.extras[id] > 0)));
  }

  const flip = <T,>(set: Set<T>, value: T): Set<T> => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  };

  async function save() {
    if (!mode) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === "room") {
        const outcome = await window.caulder.room.write(companyId, {
          sections: [...sections],
          categories: [...categories],
          extras: [...extras],
          secrets,
        });
        if (outcome) {
          const parts = [plural(outcome.pages, "page"), plural(outcome.documents, "document")];
          setDone({
            which: "room",
            text: `Saved ${outcome.file}: ${parts.join(" and ")}.${
              outcome.missing > 0
                ? ` ${plural(outcome.missing, "stored file")} could not be found on this computer; the index says which.`
                : ""
            }`,
          });
          setMode(null);
        }
      } else {
        const outcome = await window.caulder.room.handbook(companyId, {
          sections: [...sections],
          extras: [...extras],
          secrets,
        });
        if (outcome) {
          setDone({ which: "handbook", text: `Saved ${outcome.file}: ${plural(outcome.pages, "page")}.` });
          setMode(null);
        }
      }
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  const allowed: readonly RoomExtra[] = mode === "handbook" ? HANDBOOK_EXTRAS : ROOM_EXTRAS;
  const nothing = sections.size === 0 && categories.size === 0 && extras.size === 0;

  return (
    <Card
      title="Hand it over"
      hint="A data room for an investor, zipped with an index; or a handbook for somebody joining, as one PDF."
    >
      {!mode && (
        <div className="actions">
          <button type="button" className="btn btn--sm" disabled={!choices} onClick={() => start("room")}>
            <FolderArchive size={14} aria-hidden />
            Make a data room
          </button>
          <button type="button" className="btn btn--sm" disabled={!choices} onClick={() => start("handbook")}>
            <BookOpen size={14} aria-hidden />
            Print the handbook
          </button>
        </div>
      )}

      {mode && choices && (
        <form
          className="handover anim-spring"
          aria-label={mode === "room" ? "What goes in the data room" : "What goes in the handbook"}
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <fieldset className="handover__group">
            <legend className="handover__legend">Pages</legend>
            {choices.sections.map((section) => (
              <Option
                key={section.id}
                label={section.label}
                count={section.pages > 0 ? plural(section.pages, "page") : "Nothing yet"}
                checked={sections.has(section.id)}
                disabled={busy || section.pages === 0}
                onChange={() => setSections((set) => flip(set, section.id))}
              />
            ))}
          </fieldset>

          {mode === "room" && (
            <fieldset className="handover__group">
              <legend className="handover__legend">Documents</legend>
              {choices.categories.map((category) => {
                const total = category.files + category.written;
                const count =
                  total === 0
                    ? "Nothing yet"
                    : [
                        category.files > 0 ? plural(category.files, "file") : null,
                        category.written > 0 ? `${category.written} written down` : null,
                      ]
                        .filter(Boolean)
                        .join(", ");
                return (
                  <Option
                    key={category.id}
                    label={category.label}
                    count={count}
                    checked={categories.has(category.id)}
                    disabled={busy || total === 0}
                    onChange={() => setCategories((set) => flip(set, category.id))}
                  />
                );
              })}
            </fieldset>
          )}

          <fieldset className="handover__group">
            <legend className="handover__legend">Tables</legend>
            {allowed.map((extra) => (
              <Option
                key={extra}
                label={mode === "handbook" && extra === "people" ? "Who is who" : mode === "handbook" && extra === "products" ? "What we sell" : ROOM_EXTRA_LABEL[extra]}
                count={choices.extras[extra] > 0 ? String(choices.extras[extra]) : "Nothing yet"}
                checked={extras.has(extra)}
                disabled={busy || choices.extras[extra] === 0}
                onChange={() => setExtras((set) => flip(set, extra))}
              />
            ))}
          </fieldset>

          <label className="checkline handover__secrets">
            <input
              type="checkbox"
              className="tickbox"
              checked={secrets}
              disabled={busy}
              onChange={(event) => setSecrets(event.target.checked)}
            />
            <span className="checkline__text">
              <span className="checkline__title">Registration and account numbers in full</span>
              <span className="card__hint">Off, they are written masked.</span>
            </span>
          </label>

          <div className="actions">
            <button type="button" className="btn btn--sm" disabled={busy} onClick={() => setMode(null)}>
              Cancel
            </button>
            <button type="submit" className="btn btn--sm btn--primary" disabled={busy || nothing}>
              {busy ? "Saving" : mode === "room" ? "Save the data room" : "Save the handbook"}
            </button>
          </div>
        </form>
      )}

      <ErrorLine>{error}</ErrorLine>
      {done && (
        <div className="handover__done" role="status">
          <p className="card__hint">{done.text}</p>
          <button
            type="button"
            className="btn btn--sm btn--ghost"
            onClick={() => void window.caulder.room.reveal(companyId, done.which).catch((cause: unknown) => setError(messageOf(cause)))}
          >
            <FolderOpen size={14} aria-hidden />
            Show it in its folder
          </button>
        </div>
      )}
    </Card>
  );
}

function Option({
  label,
  count,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  count: string;
  checked: boolean;
  disabled: boolean;
  onChange: () => void;
}) {
  return (
    <label className={`handover__option${disabled && !checked ? " handover__option--empty" : ""}`}>
      <input type="checkbox" className="tickbox" checked={checked} disabled={disabled} onChange={onChange} />
      <span className="handover__label">{label}</span>
      <span className="handover__count">{count}</span>
    </label>
  );
}
