import { useEffect, useState } from "react";
import { Target } from "lucide-react";
import type { BrainPageSummary } from "@shared/brain";
import { Card } from "@/components/Card";
import { PageList } from "@/features/brain/SectionView";
import { companyGoals } from "./goalAreas";

/** Enough to be reminded; the rest are a press away in the Brain. */
const SHOWN = 6;

/**
 * The company's goals and milestones, under your own on Life's Goals tab, so
 * what you want from the year and what the company wants from it are read
 * together. Only read here: each opens in the Brain, where the company's
 * pages are kept and changed. Nothing at all when its Plan has none.
 */
export function CompanyGoals({
  companyId,
  companyName,
  version,
  onOpenPage,
}: {
  companyId: string;
  companyName: string;
  version: number;
  /** Goes to the Brain: these pages are the company's, not yours. */
  onOpenPage: (pageId: string) => void;
}) {
  const [pages, setPages] = useState<BrainPageSummary[]>([]);

  useEffect(() => {
    let live = true;
    window.caulder.brain.section(companyId, "plan", false).then(
      (next) => live && setPages(companyGoals(next)),
      // A list that is only a reminder: failing to read it is no reason to say anything.
      () => live && setPages([]),
    );
    return () => {
      live = false;
    };
  }, [companyId, version]);

  if (pages.length === 0) return null;
  const more = pages.length - SHOWN;

  return (
    <Card icon={<Target size={15} aria-hidden />} title="The company's goals" hint={`From ${companyName}'s Plan. Each opens in the Brain.`}>
      <PageList pages={pages.slice(0, SHOWN)} onOpen={onOpenPage} label="The company's goals" />
      {more > 0 && <p className="card__hint">{more === 1 ? "One more" : `${more} more`} in the Brain, under Plan.</p>}
    </Card>
  );
}
