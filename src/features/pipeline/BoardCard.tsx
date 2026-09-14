import { useEffect, useRef, useState } from "react";
import { CircleDot, MoveRight } from "lucide-react";
import type { BoardCard } from "@shared/domain";
import { formatValue, relativeDay } from "@/lib/format";

/**
 * One lead on the board.
 *
 * The card body opens the lead. Moving is a separate menu button, so a click
 * meaning "show me this" and a click meaning "move this" are never the same
 * gesture. Dragging is offered on top of both.
 */
export function BoardCardView({
  card,
  stageId,
  stages,
  busy,
  onOpen,
  onMove,
  onDragStart,
  onDragEnd,
}: {
  card: BoardCard;
  stageId: string | null;
  stages: { id: string; name: string }[];
  busy: boolean;
  onOpen: () => void;
  onMove: (stageId: string | null) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapper = useRef<HTMLLIElement>(null);

  // Clicking anywhere else, or pressing Escape, closes the menu. Without both
  // the menu is a trap for anyone not using a mouse.
  useEffect(() => {
    if (!menuOpen) return;

    function onPointerDown(event: MouseEvent) {
      if (!wrapper.current?.contains(event.target as Node)) setMenuOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  return (
    <li className="boardcard" ref={wrapper}>
      <div
        className="boardcard__drag"
        draggable={!busy}
        onDragStart={(event) => {
          // A private type rather than text/plain: dropping a card must not
          // also paste its id into whatever else is on screen.
          event.dataTransfer.setData("text/caulder-lead", card.id);
          event.dataTransfer.effectAllowed = "move";
          onDragStart();
        }}
        onDragEnd={onDragEnd}
      >
        <button type="button" className="boardcard__open" onClick={onOpen}>
          <span className="boardcard__name">{card.name}</span>
          {(card.contactPerson || card.city) && (
            <span className="boardcard__sub">
              {[card.contactPerson, card.city].filter(Boolean).join(" · ")}
            </span>
          )}
        </button>

        <div className="boardcard__foot">
          {/* Louder than the next-step mark, because acting on this card by
              mistake is the one error here that reaches a real person. */}
          {card.doNotContact && (
            <span className="boardcard__flag boardcard__flag--stop">
              <CircleDot size={11} aria-hidden />
              Do not contact
            </span>
          )}

          {card.value !== null && (
            <span className="boardcard__value">{formatValue(card.value)}</span>
          )}

          {/* A lead with nothing planned is how one drifts, so the card says
              so rather than leaving it to be discovered on Today. */}
          {card.hasNextStep ? (
            <span className="boardcard__flag boardcard__flag--ok">
              <CircleDot size={11} aria-hidden />
              Next step set
            </span>
          ) : (
            <span className="boardcard__flag">
              <CircleDot size={11} aria-hidden />
              No next step
            </span>
          )}

          <span className="boardcard__when">
            {card.lastContactedAt ? relativeDay(card.lastContactedAt) : "Never contacted"}
          </span>
        </div>
      </div>

      <button
        type="button"
        className="boardcard__move"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label={`Move ${card.name} to another stage`}
        title="Move to"
        disabled={busy}
        onClick={() => setMenuOpen((open) => !open)}
      >
        <MoveRight size={14} aria-hidden />
      </button>

      {menuOpen && (
        <div className="boardmenu anim-menu" role="menu">
          {stages
            .filter((stage) => stage.id !== stageId)
            .map((stage) => (
              <button
                key={stage.id}
                type="button"
                role="menuitem"
                className="boardmenu__item"
                onClick={() => {
                  setMenuOpen(false);
                  onMove(stage.id);
                }}
              >
                {stage.name}
              </button>
            ))}
        </div>
      )}
    </li>
  );
}
