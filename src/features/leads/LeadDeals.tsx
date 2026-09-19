import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  LOSS_REASONS,
  LOSS_REASON_LABEL,
  dealInput,
  type Deal,
  type Lead,
  type PipelineStage,
} from "@shared/domain";
import { Select } from "@/components/Select";
import { ErrorLine } from "@/components/ErrorLine";
import { formatValue } from "@/lib/format";
import { messageOf } from "@/lib/errors";
import { useWorkspace } from "@/lib/workspace";

/**
 * What is being sold to this contact.
 *
 * A contact can have several deals - a school that buys twice, two products
 * to one customer - and each moves along the funnel on its own. Every change
 * lands on the contact's history.
 */
export function LeadDeals({
  lead,
  stages,
  version,
  onChanged,
}: {
  lead: Lead;
  stages: PipelineStage[];
  /** Changes when the contact was edited, which can move its one deal. */
  version: number;
  /** A deal moved or changed: the header and the history may say something new. */
  onChanged: () => void;
}) {
  const { activeCompany } = useWorkspace();
  const [deals, setDeals] = useState<Deal[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  /** A deal just moved to a lost stage, waiting for a reason or a skip. */
  const [lost, setLost] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    window.caulder.deals
      .forLead(lead.id)
      .then(setDeals)
      .catch((cause: unknown) => setError(messageOf(cause)));
  }, [lead.id]);

  useEffect(load, [load, version]);

  async function act(work: () => Promise<unknown>, after?: () => void) {
    setBusy(true);
    setError(null);
    try {
      await work();
      after?.();
      load();
      onChanged();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  const stageOptions = [
    ...stages.map((stage) => ({ value: stage.id, label: stage.name })),
    { value: "", label: "No stage" },
  ];
  const kindOf = (stageId: string | null) => stages.find((stage) => stage.id === stageId)?.kind ?? "open";

  function move(deal: Deal, stageId: string) {
    const next = stageId === "" ? null : stageId;
    void act(
      () => window.caulder.deals.setStage(deal.id, next),
      () => setLost(kindOf(next) === "lost" ? deal.id : null),
    );
  }

  if (!deals) return <ErrorLine>{error}</ErrorLine>;

  return (
    <div className="leadtasks leaddeals">
      <div className="leadtasks__head">
        <h2 className="card__title">Deals</h2>
        {!adding && (
          <button type="button" className="btn btn--sm" onClick={() => setAdding(true)} disabled={busy}>
            <Plus size={14} aria-hidden />
            Add a deal
          </button>
        )}
      </div>

      <ErrorLine>{error}</ErrorLine>

      {deals.length === 0 && !adding && (
        <p className="card__hint">
          No deals with {lead.name}. Add one when there is something to sell them; it goes on Deals.
        </p>
      )}

      {deals.length > 0 && (
        <ul className="deallist" aria-label={`Deals with ${lead.name}`}>
          {deals.map((deal) =>
            editing === deal.id ? (
              <li key={deal.id} className="dealrow dealrow--editing">
                <DealForm
                  initial={deal}
                  stages={stageOptions}
                  busy={busy}
                  submitLabel="Save deal"
                  onCancel={() => setEditing(null)}
                  onSubmit={(input) => act(() => window.caulder.deals.update(deal.id, input), () => setEditing(null))}
                />
              </li>
            ) : (
              <li key={deal.id} className={`dealrow dealrow--${kindOf(deal.stageId)}`}>
                <div className="dealrow__main">
                  <button type="button" className="dealrow__title" onClick={() => setEditing(deal.id)}>
                    {deal.title}
                  </button>
                  <span className="dealrow__meta">
                    {deal.value !== null ? formatValue(deal.value, activeCompany?.currency) : "No value yet"}
                    {deal.lossReason ? ` · Lost because: ${deal.lossReason}` : ""}
                  </span>
                </div>
                <Select
                  compact
                  aria-label={`Stage of ${deal.title}`}
                  value={deal.stageId ?? ""}
                  onChange={(value) => move(deal, value)}
                  disabled={busy}
                  options={stageOptions}
                />
                <button
                  type="button"
                  className="btn btn--sm btn--ghost btn--danger btn--icon"
                  aria-label={`Delete the deal ${deal.title}`}
                  title="Delete the deal. Its quotes and invoices stay with the contact."
                  disabled={busy}
                  onClick={() => void act(() => window.caulder.deals.remove(deal.id))}
                >
                  <Trash2 size={14} aria-hidden />
                </button>
                {lost === deal.id && (
                  <div className="dealrow__why anim-spring">
                    <span className="card__hint">Why was it lost? Saying so is how the pattern shows.</span>
                    <div className="actions">
                      {LOSS_REASONS.filter((reason) => reason !== "other").map((reason) => (
                        <button
                          key={reason}
                          type="button"
                          className="btn btn--sm"
                          disabled={busy}
                          onClick={() =>
                            void act(
                              () => window.caulder.deals.setLoss(deal.id, LOSS_REASON_LABEL[reason]),
                              () => setLost(null),
                            )
                          }
                        >
                          {LOSS_REASON_LABEL[reason]}
                        </button>
                      ))}
                      <button type="button" className="btn btn--sm btn--ghost" onClick={() => setLost(null)}>
                        Skip
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ),
          )}
        </ul>
      )}

      {adding && (
        <DealForm
          initial={{ title: deals.length === 0 ? lead.name : `${lead.name}: `, stageId: stages[0]?.id ?? null, value: null }}
          // A new deal always starts somewhere on the board.
          stages={stageOptions.filter((option) => option.value !== "")}
          busy={busy}
          submitLabel="Add deal"
          onCancel={() => setAdding(false)}
          onSubmit={(input) => act(() => window.caulder.deals.create(lead.id, input), () => setAdding(false))}
        />
      )}
    </div>
  );
}

function DealForm({
  initial,
  stages,
  busy,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: { title: string; stageId: string | null; value: number | null };
  stages: { value: string; label: string }[];
  busy: boolean;
  submitLabel: string;
  onSubmit: (input: { title: string; stageId: string | null; value: number | null }) => Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial.title);
  const [stageId, setStageId] = useState(initial.stageId ?? "");
  const [value, setValue] = useState(initial.value === null ? "" : String(initial.value));
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    const amount = value.trim() === "" ? null : Number(value.replace(/[,\s]/g, ""));
    const parsed = dealInput.safeParse({ title, stageId: stageId === "" ? null : stageId, value: amount });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the deal.");
      return;
    }
    void onSubmit(parsed.data);
  }

  return (
    <form
      className="leadform dealform anim-spring"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || busy) return;
        event.preventDefault();
        onCancel();
      }}
      noValidate
    >
      <div className="field">
        <label className="field__label" htmlFor="deal-title">
          Deal
        </label>
        <input
          id="deal-title"
          className="input"
          value={title}
          maxLength={160}
          autoFocus
          disabled={busy}
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>
      <div className="leadform__row">
        <div className="field">
          <label className="field__label" htmlFor="deal-stage">
            Deal stage
          </label>
          <Select id="deal-stage" value={stageId} onChange={setStageId} disabled={busy} options={stages} />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="deal-value">
            Deal value
          </label>
          <input
            id="deal-value"
            className="input"
            inputMode="numeric"
            value={value}
            disabled={busy}
            onChange={(event) => setValue(event.target.value)}
          />
        </div>
      </div>
      <ErrorLine>{error}</ErrorLine>
      <div className="leadform__actions">
        <button type="button" className="btn" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className="btn btn--primary" disabled={busy}>
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
