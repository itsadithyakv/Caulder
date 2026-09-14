import { useCallback, useEffect, useState } from "react";
import { Plus, Search, Trash2, Users, X, Upload } from "lucide-react";
import {
  LEAD_SORT_DEFAULT_DIRECTION,
  type LeadInput,
  type LeadSort,
  type PipelineStage,
} from "@shared/domain";
import { useWorkspace } from "@/lib/workspace";
import { EMPTY_FILTERS, useLeads, type Filters } from "./useLeads";
import { LeadsTable } from "./LeadsTable";
import { LeadDetail } from "./LeadDetail";
import { LeadForm } from "./LeadForm";
import { Select } from "@/components/Select";

/**
 * The Leads screen has three modes: the list, one lead, or the new-lead form.
 * Keeping them as modes of one screen rather than routes means the filters
 * survive going into a lead and coming back out.
 */
type Mode = { kind: "list" } | { kind: "detail"; id: string } | { kind: "new" };

export function LeadsScreen({
  openLeadId,
  onConsumeOpenLead,
  searchNonce = 0,
  newLeadNonce = 0,
  listNonce = 0,
  onGoToImport,
  onGoToMoney,
}: {
  /** Set when Today sends the user straight to one lead. */
  openLeadId?: string | null;
  onConsumeOpenLead?: () => void;
  /**
   * Bumped by the `/` and `N` shortcuts. A counter rather than a boolean,
   * because pressing the same key twice has to act twice.
   */
  searchNonce?: number;
  newLeadNonce?: number;
  /** Bumped when the sidebar's Leads row is pressed while already here: back to the list. */
  listNonce?: number;
  onGoToImport: () => void;
  onGoToMoney: () => void;
}) {
  const { activeCompany, refresh } = useWorkspace();
  const companyId = activeCompany?.id ?? null;
  const timezone = activeCompany?.timezone ?? "UTC";

  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [mode, setMode] = useState<Mode>({ kind: "list" });
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set());
  /** Where the last tick was, so shift-click knows what range to fill in. */
  const [anchor, setAnchor] = useState<number | null>(null);

  const { leads, loading, error, reload, patch, remove } = useLeads(companyId, filters);

  useEffect(() => {
    if (!companyId) return;
    window.caulder.companies.stages(companyId).then(setStages).catch(() => setStages([]));
  }, [companyId]);

  // Switching company must not leave a lead from the previous one on screen.
  useEffect(() => {
    setMode({ kind: "list" });
    setFilters(EMPTY_FILTERS);
  }, [companyId]);

  // A selection only means anything against the rows it was made from. Once
  // the filters change, the ids on screen are different and acting on the old
  // set would hit leads the user can no longer see.
  useEffect(() => {
    setPicked(new Set());
    setAnchor(null);
  }, [companyId, filters.search, filters.stageId]);

  // Today can hand over a lead to open. Cleared once acted on, so coming back
  // to Leads later lands on the list rather than reopening it.
  useEffect(() => {
    if (!openLeadId) return;
    setMode({ kind: "detail", id: openLeadId });
    onConsumeOpenLead?.();
  }, [openLeadId, onConsumeOpenLead]);

  // `/` goes back to the list and puts the cursor in the search box.
  useEffect(() => {
    if (searchNonce === 0) return;
    setMode({ kind: "list" });
    // After the render that shows the list, or there is nothing to focus.
    const id = requestAnimationFrame(() => {
      document.querySelector<HTMLInputElement>(".leads__searchInput")?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [searchNonce]);

  // The sidebar row means the list. Pressing it from inside a lead used to do
  // nothing, because the route had not changed - and a row that does nothing
  // reads as broken.
  useEffect(() => {
    if (listNonce === 0) return;
    setMode({ kind: "list" });
  }, [listNonce]);

  useEffect(() => {
    if (newLeadNonce === 0) return;
    setMode({ kind: "new" });
  }, [newLeadNonce]);

  const create = useCallback(
    async (input: LeadInput) => {
      if (!companyId) return;
      setBusy(true);
      try {
        const created = await window.caulder.leads.create(companyId, input);
        reload();
        // The sidebar carries a lead count, and it comes from the company
        // record rather than from this list. Without this it keeps whatever
        // it read at launch, so adding leads all session leaves it saying 0.
        refresh();
        setMode({ kind: "detail", id: created.id });
      } finally {
        setBusy(false);
      }
    },
    [companyId, reload, refresh],
  );

  /**
   * Ticking one row, with shift-click filling in the range from the last one.
   *
   * The range is computed against the rows as currently shown, which is the
   * only thing the user could have meant by "everything between these two".
   */
  const toggleOne = useCallback(
    (id: string, index: number, shiftKey: boolean) => {
      setPicked((current) => {
        const next = new Set(current);

        if (shiftKey && anchor !== null) {
          const [from, to] = anchor < index ? [anchor, index] : [index, anchor];
          // Shift extends: it adds the span rather than replacing what is
          // already ticked, which is how every file list behaves.
          for (let i = from; i <= to; i += 1) {
            const row = leads[i];
            if (row) next.add(row.id);
          }
          return next;
        }

        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      setAnchor(index);
    },
    [anchor, leads],
  );

  /** The header box: all on, or all off if they already are. */
  const toggleAll = useCallback(() => {
    setPicked((current) => {
      const everyone = leads.every((lead) => current.has(lead.id));
      return everyone ? new Set() : new Set(leads.map((lead) => lead.id));
    });
    setAnchor(null);
  }, [leads]);

  const clearPicked = useCallback(() => {
    setPicked(new Set());
    setAnchor(null);
  }, []);

  /**
   * Clicking a column heading. The same column reverses; a new one starts in
   * whichever direction is useful for it.
   */
  const sortBy = useCallback(
    (sort: LeadSort) => {
      setFilters((current) =>
        current.sort === sort
          ? { ...current, direction: current.direction === "asc" ? "desc" : "asc" }
          : { ...current, sort, direction: LEAD_SORT_DEFAULT_DIRECTION[sort] },
      );
    },
    [],
  );

  const movePicked = useCallback(
    async (stageId: string | null) => {
      if (!companyId || picked.size === 0) return;
      setBusy(true);
      try {
        await window.caulder.leads.setStageMany(companyId, [...picked], stageId);
        reload();
        clearPicked();
      } finally {
        setBusy(false);
      }
    },
    [companyId, picked, reload, clearPicked],
  );

  const deletePicked = useCallback(async () => {
    if (!companyId || picked.size === 0) return;
    setBusy(true);
    try {
      await window.caulder.leads.removeMany(companyId, [...picked]);
      reload();
      refresh();
      clearPicked();
    } finally {
      setBusy(false);
    }
  }, [companyId, picked, reload, refresh, clearPicked]);

  if (!companyId) return null;

  if (mode.kind === "new") {
    return (
      <section className="card leads__formCard">
        <h2 className="card__title">Add a contact</h2>
        <p className="card__hint">
          Only the name is needed. Everything else can follow.
        </p>
        <LeadForm
          stages={stages}
          busy={busy}
          onSubmit={create}
          onCancel={() => setMode({ kind: "list" })}
        />
      </section>
    );
  }

  if (mode.kind === "detail") {
    return (
      <LeadDetail
        leadId={mode.id}
        stages={stages}
        onBack={() => setMode({ kind: "list" })}
        onGoToMoney={onGoToMoney}
        onSaved={patch}
        onDeleted={(id) => {
          remove(id);
          setMode({ kind: "list" });
        }}
      />
    );
  }

  const filtering = filters.search.trim().length > 0 || filters.stageId !== undefined;

  return (
    <div className="leads">
      <Toolbar
        filters={filters}
        stages={stages}
        onChange={setFilters}
        onNew={() => setMode({ kind: "new" })}
        onImport={onGoToImport}
      />

      {picked.size > 0 && (
        <BulkBar
          count={picked.size}
          stages={stages}
          busy={busy}
          onMove={movePicked}
          onDelete={deletePicked}
          onClear={clearPicked}
        />
      )}

      {error && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}

      {leads.length > 0 ? (
        <>
          <div className="leads__table">
          <LeadsTable
            leads={leads}
            stages={stages}
            timezone={timezone}
            sort={filters.sort}
            direction={filters.direction}
            selected={picked}
            onSort={sortBy}
            onToggle={toggleOne}
            onToggleAll={toggleAll}
            onSelect={(lead) => setMode({ kind: "detail", id: lead.id })}
          />
          </div>
          <p className="leads__count">
            {leads.length} {leads.length === 1 ? "contact" : "contacts"}
            {filtering ? " matching" : ""}
          </p>
        </>
      ) : loading ? null : filtering ? (
        <section className="card">
          <div className="empty">
            <Search size={24} className="empty__icon" aria-hidden />
            <p className="empty__title">Nothing matches those filters</p>
            <p className="empty__body">
              Try a shorter search, or clear the stage filter.
            </p>
            <button
              type="button"
              className="btn"
              onClick={() => setFilters(EMPTY_FILTERS)}
            >
              Clear filters
            </button>
          </div>
        </section>
      ) : (
        <section className="card">
          <div className="empty">
            <Users size={24} className="empty__icon" aria-hidden />
            <p className="empty__title">No contacts yet</p>
            <p className="empty__body">
              Import a spreadsheet to bring in a list, or add one by hand.
            </p>
            <div className="empty__actions">
              <button type="button" className="btn btn--primary" onClick={onGoToImport}>
                Import a spreadsheet
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => setMode({ kind: "new" })}
              >
                Add a contact
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function Toolbar({
  filters,
  stages,
  onChange,
  onNew,
  onImport,
}: {
  filters: Filters;
  stages: PipelineStage[];
  onChange: (filters: Filters) => void;
  onNew: () => void;
  onImport: () => void;
}) {
  return (
    <div className="leads__toolbar">
      <div className="leads__search">
        <Search size={15} className="leads__searchIcon" aria-hidden />
        <input
          className="input leads__searchInput"
          value={filters.search}
          onChange={(event) => onChange({ ...filters, search: event.target.value })}
          placeholder="Search name, contact, email, phone or city"
          aria-label="Search contacts"
          type="search"
        />
      </div>

      <Select
        compact
        className="leads__filter"
        aria-label="Filter by stage"
        value={filters.stageId === undefined ? "" : (filters.stageId ?? "none")}
        onChange={(raw) => {
          onChange({
            ...filters,
            stageId: raw === "" ? undefined : raw === "none" ? null : raw,
          });
        }}
        options={[
          { value: "", label: "Every stage" },
          ...stages.map((stage) => ({ value: stage.id, label: stage.name })),
          { value: "none", label: "No stage" },
        ]}
      />

      {/* No sort control here. The column headings are the sort control, which
          is where somebody looks for one and where every CRM puts it. */}

      {/* Import lives here rather than in the sidebar: it is something done
          to this list a handful of times, not a place to go. */}
      <button type="button" className="btn" onClick={onImport}>
        <Upload size={15} aria-hidden />
        Import
      </button>

      <button type="button" className="btn btn--primary" onClick={onNew}>
        <Plus size={15} aria-hidden />
        Add contact
      </button>
    </div>
  );
}

/**
 * What you can do to a selection.
 *
 * Takes the toolbar's place rather than sitting beside it, because while rows
 * are ticked the list is in a different mode and offering "Add lead" next to
 * "Delete 12 leads" invites the wrong click.
 *
 * Deleting asks first. Every other action here is a stage move, which is one
 * click to undo; this one is not, and the number in the button is the number
 * that disappears.
 */
function BulkBar({
  count,
  stages,
  busy,
  onMove,
  onDelete,
  onClear,
}: {
  count: number;
  stages: PipelineStage[];
  busy: boolean;
  onMove: (stageId: string | null) => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const noun = count === 1 ? "contact" : "contacts";

  return (
    <div
      className="bulkbar anim-panel"
      role="region"
      aria-label="Actions for the selected leads"
    >
      <span className="bulkbar__count">
        {count} {noun} selected
      </span>

      {/* Stays on its own label rather than showing a stage, because it is an
          action to take, not the current state of anything. */}
      <Select
        compact
        className="bulkbar__move"
        aria-label="Move the selected leads to a stage"
        value=""
        disabled={busy}
        onChange={(raw) => {
          if (raw === "") return;
          onMove(raw === "none" ? null : raw);
        }}
        options={[
          { value: "", label: "Move to stage" },
          ...stages.map((stage) => ({ value: stage.id, label: stage.name })),
          { value: "none", label: "No stage" },
        ]}
      />

      {confirming ? (
        <>
          <span className="bulkbar__ask">
            Delete {count} {noun}, and everything on their timelines?
          </span>
          <button
            type="button"
            className="btn btn--sm btn--danger"
            disabled={busy}
            onClick={() => {
              setConfirming(false);
              onDelete();
            }}
          >
            Delete {count} {noun}
          </button>
          <button
            type="button"
            className="btn btn--sm"
            disabled={busy}
            onClick={() => setConfirming(false)}
          >
            Keep them
          </button>
        </>
      ) : (
        <button
          type="button"
          className="btn btn--sm"
          disabled={busy}
          onClick={() => setConfirming(true)}
        >
          <Trash2 size={14} aria-hidden />
          Delete
        </button>
      )}

      <button
        type="button"
        className="btn btn--sm btn--ghost bulkbar__clear"
        onClick={onClear}
        disabled={busy}
      >
        <X size={14} aria-hidden />
        Clear
      </button>
    </div>
  );
}
