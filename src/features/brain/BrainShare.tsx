import { useState } from "react";
import { Download, Sparkles } from "lucide-react";
import { Card } from "@/components/Card";
import { ErrorLine } from "@/components/ErrorLine";
import { messageOf } from "@/lib/errors";
import { SharingCard } from "@/features/sharing/SharingCard";
import { HandOverCard } from "@/features/dataroom/HandOverCard";

/**
 * Everything that takes the brain out of this Caulder, in one place: sharing
 * it with a co-founder, handing it to an investor or somebody joining, and
 * exporting it. Done now and then, so it has a page on the rail rather than
 * cards on Brain home.
 */
export function BrainShare({
  companyId,
  version,
  onGoToSettings,
  onChanged,
}: {
  companyId: string;
  version: number;
  onGoToSettings: () => void;
  onChanged: () => void;
}) {
  return (
    <div className="brainshare">
      <SharingCard companyId={companyId} onGoToSettings={onGoToSettings} onChanged={onChanged} />
      <HandOverCard companyId={companyId} version={version} />
      <ExportCard companyId={companyId} />
    </div>
  );
}

function ExportCard({ companyId }: { companyId: string }) {
  const [secrets, setSecrets] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(kind: "pages" | "dossier") {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const result =
        kind === "pages"
          ? await window.caulder.brain.exportAll(companyId, secrets)
          : await window.caulder.brain.dossier(companyId, secrets);
      if (result) setDone(`${result.files} files written to ${result.folder}`);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      title="Take it with you"
      hint="Every page as a Markdown file, or the whole company - brain, contacts, calls, deals and money - as four long documents to give an AI assistant."
    >
      <label className="checkline">
        <input
          type="checkbox"
          className="tickbox"
          checked={secrets}
          disabled={busy}
          aria-label="Include registration and account numbers in full"
          onChange={(event) => setSecrets(event.target.checked)}
        />
        <span className="checkline__text">
          <span className="checkline__title">Include registration and account numbers in full</span>
          <span className="card__hint">Off, they are written masked, the way the pages show them.</span>
        </span>
      </label>
      <div className="actions">
        <button type="button" className="btn btn--sm" onClick={() => void run("pages")} disabled={busy}>
          <Download size={14} aria-hidden />
          {busy ? "Exporting" : "Export the brain"}
        </button>
        <button type="button" className="btn btn--sm" onClick={() => void run("dossier")} disabled={busy}>
          <Sparkles size={14} aria-hidden />
          Export for an AI
        </button>
      </div>
      <ErrorLine>{error}</ErrorLine>
      {done && (
        <p className="card__hint" role="status">
          {done}
        </p>
      )}
    </Card>
  );
}
