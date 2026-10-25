import { useCallback, useEffect, useState } from "react";
import { ErrorLine } from "@/components/ErrorLine";
import { messageOf } from "@/lib/errors";
import { formatDuration, formatValue } from "@/lib/format";
import type { HoursToBill as Hours } from "@shared/hours";

/**
 * The hours not yet billed (PLAN.md, part thirteen, phase 57): billable time
 * set aside for this contact that has happened, and one press to make it a
 * draft invoice. Says nothing when there is none.
 */
export function HoursToBill({ companyId, leadId, currency, onBilled }: { companyId: string; leadId: string; currency: string; onBilled: () => void }) {
  const [hours, setHours] = useState<Hours | null>(null);
  const [made, setMade] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const read = useCallback(() => {
    window.caulder.hours.toBill(companyId, leadId).then(setHours, () => setHours(null));
  }, [companyId, leadId]);
  useEffect(read, [read]);

  async function bill() {
    setError(null);
    setBusy(true);
    try {
      const invoice = await window.caulder.hours.bill(companyId, leadId);
      setMade(invoice.label);
      read();
      onBilled();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  if (made) return <p className="card__hint">{made} drafted from the hours, on Money.</p>;
  if (!hours || hours.blocks.length === 0) return null;

  return (
    <div className="field hourstobill">
      <span className="field__label">Hours to invoice</span>
      <div className="actions">
        <span>
          {formatDuration(hours.minutes)} over {hours.blocks.length === 1 ? "one block" : `${hours.blocks.length} blocks`}
          {hours.amount !== null ? `, ${formatValue(hours.amount, currency)}` : ""}
        </span>
        <button type="button" className="btn btn--sm" onClick={() => void bill()} disabled={busy}>
          Invoice the hours
        </button>
      </div>
      <ErrorLine>{error}</ErrorLine>
    </div>
  );
}
