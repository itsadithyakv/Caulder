import { Check } from "lucide-react";
import { ACCENT_IDS, ACCENT_LABEL, type AccentId } from "@shared/domain";

/**
 * A fixed set of swatches rather than a colour picker.
 *
 * Every id here has been contrast-checked in both themes in tokens.css, which
 * a free picker could not promise. Each swatch previews its own accent by
 * carrying the data-accent attribute, so what you see is the token that will
 * actually apply.
 */
export function AccentPicker({
  value,
  onChange,
  disabled,
}: {
  value: AccentId;
  onChange: (accent: AccentId) => void;
  disabled?: boolean;
}) {
  return (
    <div className="accents" role="radiogroup" aria-label="Accent colour">
      {ACCENT_IDS.map((id) => {
        const selected = id === value;
        return (
          <button
            key={id}
            type="button"
            data-accent={id}
            className="accent-swatch"
            role="radio"
            aria-checked={selected}
            aria-label={ACCENT_LABEL[id]}
            title={ACCENT_LABEL[id]}
            disabled={disabled}
            onClick={() => onChange(id)}
          >
            {/* The tick, not just the ring, so the choice survives being seen
                by someone who cannot separate these hues. */}
            {selected && <Check size={15} strokeWidth={3} aria-hidden />}
          </button>
        );
      })}
    </div>
  );
}
