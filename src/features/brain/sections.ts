import type { LucideIcon } from "lucide-react";
import {
  BookHeart,
  Building2,
  CalendarClock,
  ChartLine,
  FileText,
  Gavel,
  Landmark,
  Lightbulb,
  ListChecks,
  MessagesSquare,
  Package,
  Receipt,
  Scale,
  Target,
  Wrench,
} from "lucide-react";
import type { BrainSectionId } from "@shared/brain";

/** One icon per section, always beside its name: the icon never means anything alone. */
export const SECTION_ICON: Record<BrainSectionId, LucideIcon> = {
  company: Building2,
  plan: Target,
  products: Package,
  money: Landmark,
  tax: Receipt,
  customers: MessagesSquare,
  playbooks: ListChecks,
  legal: Scale,
  tools: Wrench,
  decisions: Gavel,
  meetings: CalendarClock,
  metrics: ChartLine,
  documents: FileText,
  ideas: Lightbulb,
  remembered: BookHeart,
};
