import { useCallback, useEffect, useState } from "react";
import { Columns3 } from "lucide-react";
import {
  LOSS_REASONS,
  LOSS_REASON_LABEL,
  type Board,
  type BoardColumn,
} from "@shared/domain";
import { useWorkspace } from "@/lib/workspace";
import { BoardCardView } from "./BoardCard";
import { formatValue } from "@/lib/format";
import { messageOf } from "@/lib/errors";

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
        setError(messageOf(cause)),
      );
  }, [companyId]);

  useEffect(load, [load]);

  /** The lead whose loss is being explained, if any. */
  const [asking, setAsking] = useState<{ leadId: string; name: string } | null>(null);

  const move = useCallback(
    async (leadId: string, stageId: string | null) => {
      setBusy(true);
      try {
        await window.caulder.leads.setStage(leadId, stageId);

        // Moved to a lost stage: ask why, after the move rather than before
        // it. The move has to land whether or not anybody stops to answer -
        // a required field on a drag is how a board stops being used.
        const lost = board?.columns.find(
          (column) => column.stageId === stageId && column.kind === "lost",
        );
        if (lost) {
          const card = board?.columns
            .flatMap((column) => column.cards)
            .find((candidate) => candidate.id === leadId);
          setAsking({ leadId, name: card?.name ?? "this lead" });
        }

        load();
      } catch (cause) {
        setError(messageOf(cause));
      } finally {
        setBusy(false);
        setDragging(null);
        setOver(null);
      }
    },
    [board, load],
  );

  if (!companyId || !board) return null;

  const empty = board.columns.every((column) => column.total === 0);
  const stages = board.columns
    .filter((column) => column.stageId !== null)
    .map((column) => ({ id: column.stageId as string, name: column.name }));

  // The columns you work, and the two you do not. Unstaged stays with the
  // working ones: leads left there by a deleted stage still need moving.
  const working = board.columns.filter((column) => column.kind === "open");
  const closed = board.columns.filter((column) => column.kind !== "open");

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

      {/* Won and Lost come out of the board.
          
          They are not further along the funnel - they are out of it, in two
          opposite directions, and they grow without limit while the working
          columns do not. Leaving them in meant seven columns that did not fit
          the window, so the two nobody drags cards into were the reason the
          five you do had to be scrolled to. */}
      <div className={`board anim-stagger${empty ? " board--empty" : ""}`} role="list">
        {working.map((column, index) => (
          <Column
            key={column.stageId ?? "unstaged"}
            column={column}
            depth={index + 1}
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

      {asking && (
        <LossReason
          name={asking.name}
          onClose={() => setAsking(null)}
          onSave={async (reason) => {
            await window.caulder.leads.setLossReason(asking.leadId, reason);
            setAsking(null);
            load();
          }}
        />
      )}

      {closed.length > 0 && (
        <div className="closed" role="list">
          {closed.map((column) => (
            <Column
              key={column.stageId ?? "closed"}
              column={column}
              depth={column.kind === "won" ? "won" : "lost"}
              stages={stages}
              busy={busy}
              dragging={dragging}
              isOver={over === (column.stageId ?? "closed")}
              onOpenLead={onOpenLead}
              onMove={move}
              onDragStart={setDragging}
              onDragEnd={() => {
                setDragging(null);
                setOver(null);
              }}
              onDragOver={() => setOver(column.stageId ?? "closed")}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Column({
  column,
  depth,
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
  /**
   * How far along the funnel, which is what the colour ramp keys off. A number
   * for a working column, or which way it left the funnel for the other two.
   */
  depth: number | "won" | "lost";
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
  const tone = typeof depth === "number" ? `s${Math.min(depth, 6)}` : depth;

  return (
    <section
      className={`column${active ? " column--over" : ""} column--${tone}`}
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
        <span className="column__head--named">
          <span className="column__dot" aria-hidden />
          <h2 className="column__name">{column.name}</h2>
        </span>
        <span className="column__count">{column.total}</span>
      </header>

      {column.value > 0 && <p className="column__value">{formatValue(column.value)}</p>}

      <ul className="column__cards">
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


/**
 * Why was this lost?
 *
 * Offered, never required. Skipping is a button rather than only an X, because
 * a dialog that can be dismissed but not declined teaches people to close it
 * without reading - and then the one time the answer mattered, it is not there
 * either.
 */
function LossReason({
  name,
  onSave,
  onClose,
}: {
  name: string;
  onSave: (reason: string | null) => Promise<void>;
  onClose: () => void;
}) {
  const [other, setOther] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(reason: string | null) {
    setBusy(true);
    try {
      await onSave(reason);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="scrim anim-in" onClick={onClose} role="presentation">
      <div
        className="card lossask anim-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Why was ${name} lost?`}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="card__title">Why was {name} lost?</h2>
        <p className="card__hint">
          The forecast can already tell you how often you lose. This is the only
          thing that can tell you why.
        </p>

        <div className="lossask__options">
          {LOSS_REASONS.filter((reason) => reason !== "other").map((reason) => (
            <button
              key={reason}
              type="button"
              className="btn btn--sm"
              disabled={busy}
              onClick={() => void save(LOSS_REASON_LABEL[reason])}
            >
              {LOSS_REASON_LABEL[reason]}
            </button>
          ))}
        </div>

        <div className="field">
          <label className="field__label" htmlFor="loss-other">
            Or say it in your own words
          </label>
          <input
            id="loss-other"
            className="input"
            value={other}
            onChange={(event) => setOther(event.target.value)}
            placeholder="They went quiet after the demo"
            maxLength={200}
            disabled={busy}
          />
        </div>

        <div className="firstrun__actions">
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            Skip
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={busy || other.trim() === ""}
            onClick={() => void save(other.trim())}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
