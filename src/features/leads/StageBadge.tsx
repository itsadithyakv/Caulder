import type { PipelineStage } from "@shared/domain";

/**
 * Stage as colour AND label, never colour alone.
 *
 * Elevation is not allowed to carry meaning in this design, and the semantic
 * palette is independent of the company accent so a stage reads the same in
 * every workspace.
 */
export function StageBadge({ stage }: { stage: PipelineStage | undefined }) {
  if (!stage) {
    return <span className="badge badge--neutral">No stage</span>;
  }

  const tone =
    stage.kind === "won" ? "ok" : stage.kind === "lost" ? "danger" : "neutral";

  return <span className={`badge badge--${tone}`}>{stage.name}</span>;
}
