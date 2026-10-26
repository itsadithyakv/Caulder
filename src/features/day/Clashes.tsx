import { AlertTriangle } from "lucide-react";
import type { DoubleBooking } from "@shared/day";
import { formatTime } from "@/lib/format";

/**
 * Two things in the calendar at once, said where the calendar is read: on
 * Today, at the head of the day, and per day in the week. A warning and no
 * more - the calendar still holds both, and which one gives way is the
 * owner's to say.
 */
export function Clashes({ clashes, label, onOpen }: { clashes: readonly DoubleBooking[]; label?: string; onOpen?: () => void }) {
  if (clashes.length === 0) return null;
  const shown = clashes.slice(0, 3);
  return (
    <div className="clashes" role="alert">
      <AlertTriangle size={15} className="clashes__icon" aria-hidden />
      <p className="clashes__text">
        <strong>{label ?? (clashes.length === 1 ? "Two things at once" : `${clashes.length} clashes`)}:</strong>{" "}
        {shown.map((clash, index) => (
          <span key={`${clash.at}-${index}`}>
            {index > 0 ? "; " : ""}
            {clash.titles[0]} and {clash.titles[1]} at {formatTime(clash.at)}
          </span>
        ))}
        {clashes.length > shown.length ? `; and ${clashes.length - shown.length} more` : ""}.
      </p>
      {onOpen && (
        <button type="button" className="btn btn--sm btn--ghost" onClick={onOpen}>
          Open the day
        </button>
      )}
    </div>
  );
}
