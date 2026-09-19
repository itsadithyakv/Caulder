import type { LucideIcon } from "lucide-react";
import { FaceExpressionless, FaceGrinning, FaceNeutral, FaceSlightlyFrowning, FaceSlightlySmiling } from "lucide-react";
import type { Mood } from "@shared/brain";

/** A face for each mood, always beside its word: the face never says it alone. */
export const MOOD_ICON: Record<Mood, LucideIcon> = {
  rough: FaceSlightlyFrowning,
  low: FaceExpressionless,
  okay: FaceNeutral,
  good: FaceSlightlySmiling,
  great: FaceGrinning,
};
