import { useEffect, useRef } from "react";
import { ArrowDown, ArrowUp, Mail, Phone } from "lucide-react";
import {
  LEAD_SORT_DEFAULT_DIRECTION,
  LEAD_SORT_LABEL,
  TASK_KIND_LABEL,
  type LeadListRow,
  type LeadSort,
  type PipelineStage,
  type SortDirection,
} from "@shared/domain";
import { StageBadge } from "./StageBadge";
import { formatValue, relativeDay } from "@/lib/format";
import { describeDue, today } from "@shared/dates";

/**
 * The leads table.
 *
 * Two rules shape it, and they pull against each other.
 *
 * **Neumorphism stops here.** The table sits in ONE sunken well rather than a
 * stack of raised cards, rows separate with a hairline and tint on hover
 * instead of lifting, and every value is flat high-contrast text. Two hundred
 * soft extruded rows is exactly the case the style handles worst.
 *
 * **A row is one line, always.** The version before this let each cell be as
 * tall as its content, so a lead with a contact, an email and a phone was
 * three lines and one with none was one. Nothing lined up across rows, and a
 * table whose rows are different heights stops being a table and becomes a
 * list of blocks - you read it top to bottom instead of scanning a column.
 * Every cell now truncates instead of wrapping, and what is cut off is in the
 * title attribute and on the lead itself.
 */
export function LeadsTable({
  leads,
  stages,
  timezone,
  sort,
  direction,
  selected,
  onSort,
  onToggle,
  onToggleAll,
  onSelect,
}: {
  leads: LeadListRow[];
  stages: PipelineStage[];
  timezone: string;
  sort: LeadSort;
  direction: SortDirection;
  selected: ReadonlySet<string>;
  onSort: (sort: LeadSort) => void;
  onToggle: (id: string, index: number, shiftKey: boolean) => void;
  onToggleAll: () => void;
  onSelect: (lead: LeadListRow) => void;
}) {
  const stageById = new Map(stages.map((stage) => [stage.id, stage]));
  const day = today(timezone);

  const allSelected = leads.length > 0 && leads.every((lead) => selected.has(lead.id));
  const someSelected = leads.some((lead) => selected.has(lead.id));

  // "Some but not all" is a third state, and a checkbox can only be told about
  // it from script. Without this, selecting three of forty shows an empty box.
  const selectAll = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (selectAll.current) selectAll.current.indeterminate = someSelected && !allSelected;
  }, [someSelected, allSelected]);

  /** Moves focus a row at a time, so the list is workable without the mouse. */
  function onRowKeyDown(event: React.KeyboardEvent<HTMLTableRowElement>, lead: LeadListRow) {
    if (event.key === "Enter") {
      event.preventDefault();
      onSelect(lead);
      return;
    }
    if (event.key === " ") {
      // Space selects rather than opens: it is the key next to the checkbox
      // in every list that has both.
      event.preventDefault();
      onToggle(lead.id, leads.indexOf(lead), event.shiftKey);
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;

    event.preventDefault();
    const row = event.currentTarget;
    const next = event.key === "ArrowDown" ? row.nextElementSibling : row.previousElementSibling;
    if (next instanceof HTMLElement) next.focus();
  }

  return (
    <div className="nm-well leadtable__well">
      <table className="leadtable">
        <thead>
          <tr>
            <th scope="col" className="leadtable__pick">
              <input
                ref={selectAll}
                type="checkbox"
                className="tickbox"
                checked={allSelected}
                onChange={onToggleAll}
                aria-label={allSelected ? "Clear the selection" : "Select every contact shown"}
              />
            </th>
            <SortHeader column="name" sort={sort} direction={direction} onSort={onSort} />
            <th scope="col">Contact</th>
            <SortHeader column="stage" sort={sort} direction={direction} onSort={onSort} />
            <SortHeader column="next" sort={sort} direction={direction} onSort={onSort} />
            <SortHeader column="value" sort={sort} direction={direction} onSort={onSort} numeric />
            <SortHeader column="recent" sort={sort} direction={direction} onSort={onSort} />
          </tr>
        </thead>

        <tbody>
          {leads.map((lead, index) => {
            const isSelected = selected.has(lead.id);
            return (
              <tr
                key={lead.id}
                className={`leadrow${isSelected ? " leadrow--picked" : ""}`}
                aria-selected={isSelected}
                tabIndex={0}
                onClick={() => onSelect(lead)}
                onKeyDown={(event) => onRowKeyDown(event, lead)}
              >
                <td
                  className="leadtable__pick"
                  // The checkbox is inside the row, and the row opens the lead.
                  // Without this, ticking a box also navigates away from it.
                  onClick={(event) => event.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    className="tickbox"
                    checked={isSelected}
                    onChange={(event) =>
                      onToggle(
                        lead.id,
                        index,
                        (event.nativeEvent as MouseEvent).shiftKey === true,
                      )
                    }
                    aria-label={`Select ${lead.name}`}
                  />
                </td>

                <td>
                  {/* The name gives up its space first. A long school name is
                      still recognisable cut short, and "Oakridge Internatio...
                      Bengaluru" tells you more than the whole name with the
                      city trimmed to "Ben...". */}
                  <span className="leadrow__title">
                    <span className="leadrow__name" title={lead.name}>
                      {lead.name}
                    </span>
                    {lead.city && <span className="leadrow__city">{lead.city}</span>}
                  </span>
                </td>

                <td>
                  <Contact lead={lead} />
                </td>

                <td>
                  <StageBadge stage={lead.stageId ? stageById.get(lead.stageId) : undefined} />
                </td>

                <td>
                  <NextStep lead={lead} day={day} />
                </td>

                <td className="leadtable__num">
                  {lead.value === null ? (
                    <span className="leadrow__missing">&mdash;</span>
                  ) : (
                    formatValue(lead.value)
                  )}
                </td>

                <td>
                  <span className="leadrow__sub">
                    {lead.lastContactedAt ? relativeDay(lead.lastContactedAt) : "Never"}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * A column heading you can sort by.
 *
 * The heading IS the control, which is the convention in every CRM and every
 * spreadsheet. Clicking the column already sorted reverses it; clicking a new
 * one starts it in whichever direction is useful for that column rather than
 * always ascending.
 */
function SortHeader({
  column,
  sort,
  direction,
  onSort,
  numeric,
}: {
  column: LeadSort;
  sort: LeadSort;
  direction: SortDirection;
  onSort: (sort: LeadSort) => void;
  numeric?: boolean;
}) {
  // The heading text comes from the same table as the sort key, so a column
  // and the thing it sorts by can never end up named differently.
  const label = LEAD_SORT_LABEL[column];
  const active = sort === column;
  const showing = active ? direction : LEAD_SORT_DEFAULT_DIRECTION[column];
  const Arrow = showing === "asc" ? ArrowUp : ArrowDown;

  return (
    <th
      scope="col"
      className={numeric ? "leadtable__num" : undefined}
      // The one thing a screen reader needs that the arrow conveys visually.
      aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        className={`sortcol${active ? " sortcol--active" : ""}`}
        onClick={() => onSort(column)}
      >
        {label}
        <Arrow size={12} className="sortcol__arrow" aria-hidden />
      </button>
    </th>
  );
}

/**
 * One line, best identifier first.
 *
 * A person's name if there is one, otherwise the address or number you would
 * actually use. Everything known is in the tooltip and on the lead, so nothing
 * is lost by not stacking it all here.
 */
function Contact({ lead }: { lead: LeadListRow }) {
  const all = [lead.contactPerson, lead.email, lead.phone, lead.altPhone].filter(Boolean);

  if (all.length === 0) {
    // Says nothing rather than showing an empty cell, because a lead with no
    // way to reach them is worth noticing.
    return <span className="leadrow__missing">No contact details</span>;
  }

  const Icon = lead.contactPerson ? null : lead.email ? Mail : Phone;
  const shown = lead.contactPerson ?? lead.email ?? lead.phone ?? lead.altPhone ?? "";

  return (
    <span className="leadrow__contact" title={all.join(" · ")}>
      {Icon && <Icon size={12} className="leadrow__contactIcon" aria-hidden />}
      {/* Its own element because text-overflow does not reach the text of a
          flex container, only of a block inside one. */}
      <span className="leadrow__ellipsis">{shown}</span>
    </span>
  );
}

/**
 * What happens next, which is the column the board already earns its keep on.
 *
 * Overdue is called out in the danger colour: a next step that has already
 * slipped is a different fact from one that is coming, and the whole point of
 * the app is that neither goes unnoticed.
 */
function NextStep({ lead, day }: { lead: LeadListRow; day: string }) {
  if (!lead.nextTaskDue) {
    return <span className="leadrow__missing">Nothing planned</span>;
  }

  const late = lead.nextTaskDue < day;
  const kind = lead.nextTaskKind ? TASK_KIND_LABEL[lead.nextTaskKind] : "Task";

  return (
    <span
      className={`leadrow__next${late ? " leadrow__next--late" : ""}`}
      title={lead.nextTaskTitle ?? undefined}
    >
      <span className="leadrow__nextKind">{kind}</span>
      {describeDue(lead.nextTaskDue, day)}
    </span>
  );
}
