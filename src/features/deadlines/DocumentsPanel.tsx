import { useCallback, useId, useState } from "react";
import { ExternalLink, FilePlus2, MapPin, Pencil, Trash2 } from "lucide-react";
import {
  DOCUMENT_CATEGORIES,
  DOCUMENT_CATEGORY_LABEL,
  daysLeftOf,
  documentInput,
  type CompanyDocument,
  type DocumentCategory,
  type DocumentInput,
} from "@shared/deadlines";
import { today as todayIn } from "@shared/dates";
import { Card } from "@/components/Card";
import { Chips, Select } from "@/components/Select";
import { EmptyState } from "@/components/EmptyState";
import { ErrorLine } from "@/components/ErrorLine";
import { useResource } from "@/lib/resource";
import { formatDay } from "@/lib/format";
import { messageOf } from "@/lib/errors";
import { useWorkspace } from "@/lib/workspace";
import { readableSize } from "@/features/leads/LeadExtras";

/** How near an expiry has to be before the list says so. */
const EXPIRY_WARN = 60;

type Filter = DocumentCategory | "all";

/**
 * The brain's Documents section: every paper the company has to be able to
 * find. Most are files kept here - copied in, so tidying Downloads loses
 * nothing. Some cannot be: the original incorporation certificate is in a
 * drawer, the lease is with the landlord. Those are written down with where
 * they are, and still say when they expire.
 */
export function DocumentsPanel({
  companyId,
  onOpenContact,
  onChanged,
}: {
  companyId: string;
  /** Said after every change, so the rail's count keeps up. */
  onChanged: () => void;
  onOpenContact: (leadId: string) => void;
}) {
  const { activeCompany } = useWorkspace();
  const fetch = useCallback(() => window.caulder.documents.list(companyId), [companyId]);
  const { data, error, reload, setError } = useResource<CompanyDocument[]>(fetch);
  const [filter, setFilter] = useState<Filter>("all");
  const [recording, setRecording] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const today = todayIn(activeCompany?.timezone ?? "UTC");

  async function run(work: () => Promise<unknown>, after?: () => void) {
    setBusy(true);
    setError(null);
    try {
      await work();
      after?.();
      reload();
      onChanged();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  async function addFiles() {
    const before = new Set((data ?? []).map((document) => document.id));
    await run(async () => {
      const next = await window.caulder.documents.add(companyId, {
        category: filter !== "all" && (data ?? []).some((document) => document.category === filter) ? filter : "other",
      });
      // One file added opens to be described: what it is, and when it expires.
      const added = (next ?? []).filter((document) => !before.has(document.id));
      if (added.length === 1 && added[0]) setEditing(added[0].id);
    });
  }

  if (!data) return <ErrorLine>{error}</ErrorLine>;

  const present = DOCUMENT_CATEGORIES.filter((category) => data.some((document) => document.category === category));
  // A kind whose last document just went is no longer a filter to be stuck on.
  const active: Filter = filter !== "all" && present.includes(filter) ? filter : "all";
  const shown = active === "all" ? data : data.filter((document) => document.category === active);

  return (
    <Card
      title="Documents"
      hint="Kept here as a file, or written down with where it is."
      actions={
        <div className="actions">
          <button type="button" className="btn btn--sm" disabled={busy || recording} onClick={() => setRecording(true)}>
            <MapPin size={14} aria-hidden />
            Write down where one is
          </button>
          <button type="button" className="btn btn--sm btn--primary" disabled={busy} onClick={() => void addFiles()}>
            <FilePlus2 size={14} aria-hidden />
            Add a file
          </button>
        </div>
      }
    >
      <ErrorLine>{error}</ErrorLine>

      {recording && (
        <DocumentForm
          busy={busy}
          startCategory={active === "all" ? "certificate" : active}
          onCancel={() => setRecording(false)}
          onSubmit={(input) =>
            run(() => window.caulder.documents.record(companyId, input), () => setRecording(false))
          }
        />
      )}

      {present.length > 1 && (
        <div className="docs__filter">
          <Chips
            aria-label="Show"
            value={active}
            onChange={setFilter}
            options={[
              { value: "all" as Filter, label: `All ${data.length}` },
              ...present.map((category) => ({ value: category as Filter, label: DOCUMENT_CATEGORY_LABEL[category] })),
            ]}
          />
        </div>
      )}

      {data.length === 0 ? (
        !recording && (
          <EmptyState
            title="No documents yet"
            body="The incorporation certificate, the tax registration, contracts, the deck. Add each once and it can be found in a minute, by you or by whoever does the accounts."
          />
        )
      ) : (
        <ul className="duelist docs" aria-label="Documents">
          {shown.map((document) =>
            editing === document.id ? (
              <li key={document.id} className="obligation">
                <DocumentForm
                  document={document}
                  busy={busy}
                  onCancel={() => setEditing(null)}
                  onSubmit={(input) =>
                    run(() => window.caulder.documents.update(document.id, input), () => setEditing(null))
                  }
                />
              </li>
            ) : (
              <li key={document.id} className="duerow">
                <span className="duerow__main duerow__main--stack">
                  {document.hasFile ? (
                    <button
                      type="button"
                      className="linklike duerow__title"
                      title="Open it"
                      onClick={() =>
                        void window.caulder.documents
                          .open(document.id)
                          .catch((cause: unknown) => setError(messageOf(cause)))
                      }
                    >
                      {document.name}
                      <ExternalLink size={12} aria-hidden />
                    </button>
                  ) : (
                    <span className="duerow__title">{document.name}</span>
                  )}
                  <span className="duerow__what">
                    {DOCUMENT_CATEGORY_LABEL[document.category]}
                    {document.bytes !== null && ` · ${readableSize(document.bytes)}`}
                    {document.location && ` · kept ${document.location}`}
                    {document.leadId && document.leadName && (
                      <>
                        {" · "}
                        <button
                          type="button"
                          className="linklike"
                          onClick={() => onOpenContact(document.leadId as string)}
                        >
                          {document.leadName}
                        </button>
                      </>
                    )}
                  </span>
                  {document.notes && <span className="duerow__what">{document.notes}</span>}
                </span>
                <Expiry expiresOn={document.expiresOn} today={today} />
                {confirming === document.id ? (
                  <span className="detail__confirm">
                    <span className="card__hint">{document.hasFile ? "The file goes too." : "Only the note goes."}</span>
                    <button
                      type="button"
                      className="btn btn--sm btn--danger"
                      disabled={busy}
                      onClick={() =>
                        void run(() => window.caulder.documents.remove(document.id), () => setConfirming(null))
                      }
                    >
                      Delete
                    </button>
                    <button type="button" className="btn btn--sm" onClick={() => setConfirming(null)}>
                      Keep
                    </button>
                  </span>
                ) : (
                  <span className="duerow__actions">
                    <button
                      type="button"
                      className="btn btn--sm btn--ghost btn--icon"
                      aria-label={`Edit ${document.name}`}
                      onClick={() => setEditing(document.id)}
                    >
                      <Pencil size={14} aria-hidden />
                    </button>
                    <button
                      type="button"
                      className="btn btn--sm btn--ghost btn--danger btn--icon"
                      aria-label={`Delete ${document.name}`}
                      onClick={() => setConfirming(document.id)}
                    >
                      <Trash2 size={14} aria-hidden />
                    </button>
                  </span>
                )}
              </li>
            ),
          )}
        </ul>
      )}
    </Card>
  );
}

/** Nothing, the date, or a warning once it is near or past. */
function Expiry({ expiresOn, today }: { expiresOn: string | null; today: string }) {
  if (!expiresOn) return null;
  const left = daysLeftOf(expiresOn, today);
  if (left < 0) return <span className="badge badge--danger">Expired {formatDay(expiresOn)}</span>;
  if (left <= EXPIRY_WARN) {
    return (
      <span className="badge badge--warn">
        {left === 0 ? "Expires today" : left === 1 ? "Expires tomorrow" : `Expires in ${left} days`}
      </span>
    );
  }
  return <span className="duerow__when">Expires {formatDay(expiresOn)}</span>;
}

const CATEGORY_OPTIONS = DOCUMENT_CATEGORIES.map((value) => ({ value, label: DOCUMENT_CATEGORY_LABEL[value] }));

function DocumentForm({
  document,
  startCategory = "other",
  busy,
  onSubmit,
  onCancel,
}: {
  /** Absent for one being written down; a stored file keeps its file. */
  document?: CompanyDocument;
  startCategory?: DocumentCategory;
  busy: boolean;
  onSubmit: (input: DocumentInput) => Promise<void>;
  onCancel: () => void;
}) {
  const id = useId();
  const [name, setName] = useState(document?.name ?? "");
  const [category, setCategory] = useState<DocumentCategory>(document?.category ?? startCategory);
  const [location, setLocation] = useState(document?.location ?? "");
  const [expiresOn, setExpiresOn] = useState(document?.expiresOn ?? "");
  const [notes, setNotes] = useState(document?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  // Where it is matters only for one that is not stored here.
  const asksWhere = !document?.hasFile;

  return (
    <form
      className="leadform anim-spring"
      aria-label={document ? `Edit ${document.name}` : "Write down where a document is"}
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        const parsed = documentInput.safeParse({
          name,
          category,
          location: location.trim() === "" ? null : location,
          expiresOn: expiresOn === "" ? null : expiresOn,
          leadId: document?.leadId ?? null,
          pageId: document?.pageId ?? null,
          notes: notes.trim() === "" ? null : notes,
        });
        if (!parsed.success) {
          setError(parsed.error.issues[0]?.message ?? "Check the document.");
          return;
        }
        if (asksWhere && !parsed.data.location) {
          setError("Say where it is kept.");
          return;
        }
        void onSubmit(parsed.data);
      }}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || busy) return;
        event.preventDefault();
        onCancel();
      }}
      noValidate
    >
      <div className="leadform__row">
        <div className="field">
          <label className="field__label" htmlFor={`${id}-name`}>
            Name
          </label>
          <input
            id={`${id}-name`}
            className="input"
            value={name}
            maxLength={200}
            autoFocus
            disabled={busy}
            placeholder="Certificate of incorporation"
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="field">
          <span className="field__label">Kind</span>
          <Select aria-label="Kind" value={category} options={CATEGORY_OPTIONS} disabled={busy} onChange={setCategory} />
        </div>
      </div>

      <div className="leadform__row">
        {asksWhere && (
          <div className="field">
            <label className="field__label" htmlFor={`${id}-where`}>
              Where it is kept
            </label>
            <input
              id={`${id}-where`}
              className="input"
              value={location}
              maxLength={300}
              disabled={busy}
              placeholder="In the blue folder in the office; on the shared drive"
              onChange={(event) => setLocation(event.target.value)}
            />
          </div>
        )}
        <div className="field">
          <label className="field__label" htmlFor={`${id}-expires`}>
            Expires on
          </label>
          <input
            id={`${id}-expires`}
            type="date"
            className="input"
            value={expiresOn}
            disabled={busy}
            onChange={(event) => setExpiresOn(event.target.value)}
          />
          <span className="field__hint">Leave empty if it does not. Today shows it a month before.</span>
        </div>
      </div>

      <div className="field">
        <label className="field__label" htmlFor={`${id}-notes`}>
          Notes
        </label>
        <textarea
          id={`${id}-notes`}
          className="input textarea"
          rows={2}
          value={notes}
          maxLength={2000}
          disabled={busy}
          onChange={(event) => setNotes(event.target.value)}
        />
      </div>

      <ErrorLine>{error}</ErrorLine>

      <div className="leadform__actions">
        <button type="button" className="btn btn--sm" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className="btn btn--sm btn--primary" disabled={busy}>
          {document ? "Save" : "Write it down"}
        </button>
      </div>
    </form>
  );
}
