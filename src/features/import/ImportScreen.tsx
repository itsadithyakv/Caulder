import { useCallback, useEffect, useState } from "react";
import { ClipboardPaste, Copy, Download, FileSpreadsheet, Undo2 } from "lucide-react";
import type {
  ChosenFile,
  ColumnMapping,
  ImportBatch,
  ImportPreview,
  ImportSummary,
  Resolution,
} from "@shared/import";
import { aiPrompt } from "@shared/paste";
import { useWorkspace } from "@/lib/workspace";

import { MappingStep } from "./MappingStep";
import { PreviewStep } from "./PreviewStep";
import { relativeDay } from "@/lib/format";
import { messageOf } from "@/lib/errors";

/** Shows the shape without needing a sentence to describe it. */
const PASTE_EXAMPLE = [
  "| Name | Email | Phone | City |",
  "| --- | --- | --- | --- |",
  "| Oakridge International School | asha@oakridge.edu.in | 9480004094 | Bengaluru |",
].join("\n");

/**
 * The import wizard: choose a file, map its columns, look at what Caulder made
 * of it, then commit. Each step is its own state so going back never loses the
 * step before it.
 *
 * Nothing is written until Commit. The preview is a read-only calculation.
 */
type Step =
  | { kind: "start" }
  | { kind: "mapping"; file: ChosenFile; mapping: ColumnMapping }
  | { kind: "preview"; file: ChosenFile; preview: ImportPreview }
  | { kind: "done"; summary: ImportSummary };

export function ImportScreen({ onGoToLeads }: { onGoToLeads: () => void }) {
  const { activeCompany, refresh: reloadWorkspace } = useWorkspace();
  const companyId = activeCompany?.id ?? null;

  const [step, setStep] = useState<Step>({ kind: "start" });
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [pasted, setPasted] = useState("");
  const [copied, setCopied] = useState(false);

  const loadBatches = useCallback(() => {
    if (!companyId) return;
    window.caulder.imports.batches(companyId).then(setBatches).catch(() => setBatches([]));
  }, [companyId]);

  useEffect(loadBatches, [loadBatches]);

  // Switching company must not leave another workspace's import on screen.
  useEffect(() => setStep({ kind: "start" }), [companyId]);

  function fail(cause: unknown) {
    setError(messageOf(cause));
  }

  async function downloadTemplate() {
    setError(null);
    setSaved(null);
    try {
      const path = await window.caulder.imports.template();
      if (path) setSaved(path);
    } catch (cause) {
      fail(cause);
    }
  }

  async function chooseFile() {
    setError(null);
    setBusy(true);
    try {
      const file = await window.caulder.imports.choose();
      if (file) setStep({ kind: "mapping", file, mapping: file.mapping });
    } catch (cause) {
      fail(cause);
    } finally {
      setBusy(false);
    }
  }

  async function usePasted() {
    setError(null);
    setBusy(true);
    try {
      const file = await window.caulder.imports.paste(pasted);
      setStep({ kind: "mapping", file, mapping: file.mapping });
      setPasted("");
    } catch (cause) {
      fail(cause);
    } finally {
      setBusy(false);
    }
  }

  async function copyPrompt() {
    setError(null);
    try {
      await navigator.clipboard.writeText(aiPrompt());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch (cause) {
      fail(cause);
    }
  }

  async function runPreview(file: ChosenFile, mapping: ColumnMapping) {
    if (!companyId) return;
    setError(null);
    setBusy(true);
    try {
      const preview = await window.caulder.imports.preview(companyId, file.fileId, mapping);
      setStep({ kind: "preview", file, preview });
    } catch (cause) {
      fail(cause);
    } finally {
      setBusy(false);
    }
  }

  async function commit(
    jobId: string,
    resolutions: Record<number, Resolution>,
    campaignId: string | null,
  ) {
    setError(null);
    setBusy(true);
    try {
      const summary = await window.caulder.imports.commit(jobId, resolutions, campaignId);
      setStep({ kind: "done", summary });
      loadBatches();
      // The sidebar shows a lead count, which this has just changed.
      reloadWorkspace();
    } catch (cause) {
      fail(cause);
    } finally {
      setBusy(false);
    }
  }

  async function undo(batchId: string) {
    setError(null);
    setBusy(true);
    try {
      await window.caulder.imports.undo(batchId);
      loadBatches();
      reloadWorkspace();
      setStep({ kind: "start" });
    } catch (cause) {
      fail(cause);
    } finally {
      setBusy(false);
    }
  }

  if (!companyId) return null;

  return (
    // Keyed on the step so each one arrives rather than replacing the last in
    // place. Four steps that swap silently read as one screen redrawing itself.
    <div className="import anim-page" key={step.kind}>
      {error && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}

      {step.kind === "start" && (
        <>
          <section className="card">
            <h2 className="card__title">Bring in a spreadsheet</h2>
            <p className="card__hint">
              Excel or CSV. Caulder reads the headers and shows you what it made of
              every row before anything is saved.
            </p>

            <div className="import__start">
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => void chooseFile()}
                disabled={busy}
              >
                <FileSpreadsheet size={15} aria-hidden />
                Choose a file
              </button>
              <button type="button" className="btn" onClick={() => void downloadTemplate()}>
                <Download size={15} aria-hidden />
                Download the template
              </button>
            </div>

            {saved && <p className="card__hint">Saved to {saved}</p>}
          </section>

          {/* The other way a list arrives now. Asking a model for one gives
              back a chat message, not a file, and saving it to a .csv just to
              browse for it is three steps of nothing. */}
          <section className="card">
            <h2 className="card__title">Or paste a list</h2>
            <p className="card__hint">
              A table from an AI, or rows copied out of a spreadsheet. Anything around
              the table is ignored.
            </p>

            <textarea
              className="textarea import__paste"
              value={pasted}
              onChange={(event) => setPasted(event.target.value)}
              placeholder={PASTE_EXAMPLE}
              aria-label="Paste a list of contacts"
              spellCheck={false}
              disabled={busy}
            />

            <div className="import__start">
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => void usePasted()}
                disabled={busy || pasted.trim() === ""}
              >
                <ClipboardPaste size={15} aria-hidden />
                Read this list
              </button>
              <button type="button" className="btn" onClick={() => void copyPrompt()}>
                <Copy size={15} aria-hidden />
                {copied ? "Prompt copied" : "Copy the prompt for an AI"}
              </button>
            </div>

            <p className="card__hint">
              The prompt names the exact columns Caulder expects, so the reply maps
              itself.
            </p>
          </section>
        </>
      )}

      {step.kind === "mapping" && (
        <MappingStep
          file={step.file}
          mapping={step.mapping}
          busy={busy}
          onChange={(mapping) => setStep({ ...step, mapping })}
          onBack={() => setStep({ kind: "start" })}
          onNext={() => void runPreview(step.file, step.mapping)}
        />
      )}

      {step.kind === "preview" && (
        <PreviewStep
          preview={step.preview}
          busy={busy}
          onBack={() =>
            setStep({ kind: "mapping", file: step.file, mapping: step.preview.mapping })
          }
          onCommit={(resolutions, campaignId) =>
            void commit(step.preview.jobId, resolutions, campaignId)
          }
        />
      )}

      {step.kind === "done" && (
        <section className="card">
          <h2 className="card__title">Import finished</h2>
          <p className="card__hint">
            {step.summary.created} added
            {step.summary.updated > 0 ? `, ${step.summary.updated} merged` : ""}
            {step.summary.skipped > 0 ? `, ${step.summary.skipped} skipped` : ""}.
          </p>
          <div className="import__start">
            <button type="button" className="btn btn--primary" onClick={onGoToLeads}>
              See the contacts
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => void undo(step.summary.batchId)}
              disabled={busy}
            >
              <Undo2 size={15} aria-hidden />
              Undo this import
            </button>
          </div>
        </section>
      )}

      {batches.length > 0 && (
        <section className="card">
          <h2 className="card__title">Earlier imports</h2>
          <p className="card__hint">
            Undo removes the contacts an import added and puts back anything it
            merged over.
          </p>
          <ul className="batches">
            {batches.map((batch) => (
              <li key={batch.id} className="batch">
                <div className="batch__what">
                  <span className="batch__name">{batch.filename}</span>
                  <span className="batch__meta">
                    {relativeDay(batch.createdAt)} &middot; {batch.createdCount} added
                    {batch.updatedCount > 0 ? `, ${batch.updatedCount} merged` : ""}
                  </span>
                </div>
                {batch.undoneAt ? (
                  <span className="badge badge--neutral">Undone</span>
                ) : (
                  <button
                    type="button"
                    className="btn btn--sm"
                    onClick={() => void undo(batch.id)}
                    disabled={busy}
                  >
                    Undo
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
