import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import {
  STAGE_KIND_LABEL,
  stageInput,
  type PipelineStage,
  type StageKind,
} from "@shared/domain";
import { Select } from "@/components/Select";
import { messageOf } from "@/lib/errors";

/**
 * The funnel, as a list you can edit.
 *
 * Reordering is Up and Down buttons rather than drag. There are seven rows in a
 * settings pane, the buttons work from the keyboard without any extra code, and
 * the board is where dragging earns its place.
 */
const STAGE_KIND_OPTIONS = (["open", "won", "lost"] as StageKind[]).map((kind) => ({
  value: kind,
  label: STAGE_KIND_LABEL[kind],
}));

export function StageEditor({ companyId }: { companyId: string }) {
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState<StageKind>("open");
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    window.caulder.companies.stages(companyId).then(setStages).catch(() => setStages([]));
  }, [companyId]);

  useEffect(load, [load]);

  const act = useCallback(async (run: () => Promise<PipelineStage[]>) => {
    setBusy(true);
    setError(null);
    try {
      setStages(await run());
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }, []);

  async function add() {
    const parsed = stageInput.safeParse({ name: newName, kind: newKind });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Give the stage a name.");
      return;
    }
    await act(() => window.caulder.board.createStage(companyId, parsed.data));
    setNewName("");
    setNewKind("open");
    setAdding(false);
  }

  return (
    <section className="card">
      <h2 className="card__title">Pipeline stages</h2>
      <p className="card__hint">
        The columns on the board, in order. Won and Lost are treated as closed:
        contacts in them are left out of the going-quiet list.
      </p>

      {error && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}

      <ul className="stages">
        {stages.map((stage, index) => (
          <li key={stage.id} className="stagerow">
            <div className="stagerow__order">
              <button
                type="button"
                className="btn btn--sm btn--ghost"
                aria-label={`Move ${stage.name} earlier`}
                disabled={busy || index === 0}
                onClick={() => void act(() => window.caulder.board.moveStage(stage.id, -1))}
              >
                <ChevronUp size={14} aria-hidden />
              </button>
              <button
                type="button"
                className="btn btn--sm btn--ghost"
                aria-label={`Move ${stage.name} later`}
                disabled={busy || index === stages.length - 1}
                onClick={() => void act(() => window.caulder.board.moveStage(stage.id, 1))}
              >
                <ChevronDown size={14} aria-hidden />
              </button>
            </div>

            <input
              className="input stagerow__name"
              defaultValue={stage.name}
              aria-label={`Name of stage ${index + 1}`}
              maxLength={40}
              disabled={busy}
              // Renaming on blur rather than on every keystroke: the unique
              // name constraint would otherwise reject halfway-typed names.
              onBlur={(event) => {
                const next = event.target.value.trim();
                if (next === "" || next === stage.name) {
                  event.target.value = stage.name;
                  return;
                }
                void act(() => window.caulder.board.renameStage(stage.id, next));
              }}
            />

            <Select
              compact
              className="stagerow__kind"
              value={stage.kind}
              aria-label={`What ${stage.name} means`}
              disabled={busy}
              onChange={(value) =>
                void act(() => window.caulder.board.setStageKind(stage.id, value))
              }
              options={STAGE_KIND_OPTIONS}
            />

            {confirming === stage.id ? (
              <span className="detail__confirm">
                <span className="card__hint">Contacts here keep their place in the list.</span>
                <button
                  type="button"
                  className="btn btn--sm btn--danger"
                  disabled={busy}
                  onClick={async () => {
                    setConfirming(null);
                    await act(() => window.caulder.board.deleteStage(stage.id));
                  }}
                >
                  Delete
                </button>
                <button
                  type="button"
                  className="btn btn--sm"
                  onClick={() => setConfirming(null)}
                >
                  Keep
                </button>
              </span>
            ) : (
              <button
                type="button"
                className="btn btn--sm btn--ghost btn--danger"
                aria-label={`Delete ${stage.name}`}
                disabled={busy}
                onClick={() => setConfirming(stage.id)}
              >
                <Trash2 size={14} aria-hidden />
              </button>
            )}
          </li>
        ))}
      </ul>

      {adding ? (
        <div className="stageadd">
          <input
            className="input"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="Negotiating"
            aria-label="New stage name"
            maxLength={40}
            autoFocus
            disabled={busy}
          />
          <Select
            compact
            className="stagerow__kind"
            value={newKind}
            aria-label="What the new stage means"
            onChange={setNewKind}
            disabled={busy}
            options={STAGE_KIND_OPTIONS}
          />
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={() => void add()}
            disabled={busy}
          >
            Add
          </button>
          <button
            type="button"
            className="btn btn--sm"
            onClick={() => {
              setAdding(false);
              setError(null);
            }}
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="btn btn--sm stages__add"
          onClick={() => setAdding(true)}
          disabled={busy}
        >
          <Plus size={14} aria-hidden />
          Add a stage
        </button>
      )}
    </section>
  );
}
