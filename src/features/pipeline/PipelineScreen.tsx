import { useCallback, useEffect, useRef, useState } from "react";
import { Columns3 } from "lucide-react";
import type { Board, BoardColumn } from "@shared/domain";
import { useWorkspace } from "@/lib/workspace";
import { BoardCardView } from "./BoardCard";
import { formatValue } from "@/lib/format";

/**
 * The pipeline board.
 *
 * Drag uses the browser's own drag-and-drop rather than a library, and every
 * card also carries a Move menu. That menu is not a fallback: it is faster than
 * dragging across seven columns, and it is the only path that works from the
 * keyboard. Dragging is the addition, not the other way round.
 */
export function PipelineScreen({
  onOpenLead,
  onGoToSettings,
}: {
  onOpenLead: (leadId: string) => void;
  onGoToSettings: () => void;
}) {
  const { activeCompany } = useWorkspace();
  const companyId = activeCompany?.id ?? null;

  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!companyId) return;
    window.caulder.board
      .get(companyId)
      .then((next) => {
        setBoard(next);
        setError(null);
      })
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : String(cause)),
      );
  }, [companyId]);

  useEffect(load, [load]);

  const move = useCallback(
    async (leadId: string, stageId: string | null) => {
      setBusy(true);
      try {
        await window.caulder.leads.setStage(leadId, stageId);
        load();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setBusy(false);
        setDragging(null);
        setOver(null);
      }
    },
    [load],
  );

  if (!companyId || !board) return null;

  const empty = board.columns.every((column) => column.total === 0);
  const stages = board.columns
    .filter((column) => column.stageId !== null)
    .map((column) => ({ id: column.stageId as string, name: column.name }));

  return (
    <div className="pipeline">
      {error && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}

      {/* The board is drawn even with nothing on it. An empty funnel with its
          stage names on it says far more than a card saying the board is
          empty - you can see the shape of the thing you are about to fill,
          and the screen is not mostly nothing. */}
      {empty && (
        <div className="hintbar">
          <Columns3 size={16} className="hintbar__icon" aria-hidden />
          <p className="hintbar__text">
            This is your funnel. Leads land in the first column and you drag them
            along it, or use the menu on a card.
          </p>
          <button type="button" className="btn btn--sm" onClick={onGoToSettings}>
            Edit the stages
          </button>
        </div>
      )}

      {(
        <div className="board anim-stagger" role="list">
          {board.columns.map((column) => (
            <Column
              key={column.stageId ?? "unstaged"}
              column={column}
              stages={stages}
              busy={busy}
              dragging={dragging}
              isOver={over === (column.stageId ?? "unstaged")}
              onOpenLead={onOpenLead}
              onMove={move}
              onDragStart={setDragging}
              onDragEnd={() => {
                setDragging(null);
                setOver(null);
              }}
              onDragOver={() => setOver(column.stageId ?? "unstaged")}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Column({
  column,
  stages,
  busy,
  dragging,
  isOver,
  onOpenLead,
  onMove,
  onDragStart,
  onDragEnd,
  onDragOver,
}: {
  column: BoardColumn;
  stages: { id: string; name: string }[];
  busy: boolean;
  dragging: string | null;
  isOver: boolean;
  onOpenLead: (leadId: string) => void;
  onMove: (leadId: string, stageId: string | null) => void;
  onDragStart: (leadId: string) => void;
  onDragEnd: () => void;
  onDragOver: () => void;
}) {
  // A column highlights only while a card is actually in flight, so a stray
  // drag of selected text does not light up the board.
  const active = dragging !== null && isOver;
  const listRef = useRef<HTMLUListElement>(null);

  return (
    <section
      className={`column${active ? " column--over" : ""} column--${column.kind}`}
      role="listitem"
      aria-label={`${column.name}, ${column.total} leads`}
      onDragOver={(event) => {
        if (!dragging) return;
        // Without this the drop never fires: the default is to refuse.
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        onDragOver();
      }}
      onDrop={(event) => {
        event.preventDefault();
        const leadId = event.dataTransfer.getData("text/caulder-lead");
        if (leadId) onMove(leadId, column.stageId);
      }}
    >
      <header className="column__head">
        <h2 className="column__name">{column.name}</h2>
        <span className="column__count">{column.total}</span>
      </header>

      {column.value > 0 && <p className="column__value">{formatValue(column.value)}</p>}

      <ul className="column__cards" ref={listRef}>
        {column.cards.map((card) => (
          <BoardCardView
            key={card.id}
            card={card}
            stageId={column.stageId}
            stages={stages}
            busy={busy}
            onOpen={() => onOpenLead(card.id)}
            onMove={(stageId) => onMove(card.id, stageId)}
            onDragStart={() => onDragStart(card.id)}
            onDragEnd={onDragEnd}
          />
        ))}
      </ul>

      {column.total > column.cards.length && (
        <p className="column__more">
          {column.total - column.cards.length} more, not shown
        </p>
      )}

      {column.total === 0 && <p className="column__empty">Nothing here</p>}
    </section>
  );
}
