import type { LucideIcon } from "lucide-react";
import {
  CalendarCheck,
  Users,
  KanbanSquare,
  Upload,
  Mail,
  Settings,
} from "lucide-react";

/**
 * Six screens and no deep linking, so a router library would be all cost and
 * no benefit. Navigation is a union type plus useState in App.
 */
export type RouteId =
  | "today"
  | "leads"
  | "pipeline"
  | "import"
  | "email"
  | "settings";

type Route = {
  id: RouteId;
  label: string;
  icon: LucideIcon;
  /** Shown in the page header under the title. */
  subtitle: string;
};

export const ROUTES: readonly Route[] = [
  {
    id: "today",
    label: "Today",
    icon: CalendarCheck,
    subtitle: "What needs doing, in the order it needs doing.",
  },
  {
    id: "leads",
    label: "Leads",
    icon: Users,
    subtitle: "Everyone you are tracking, and where each one stands.",
  },
  {
    id: "pipeline",
    label: "Pipeline",
    icon: KanbanSquare,
    subtitle: "The funnel by stage.",
  },
  {
    id: "import",
    label: "Import",
    icon: Upload,
    subtitle: "Bring leads in from a spreadsheet, or paste a list.",
  },
  {
    id: "email",
    label: "Email",
    icon: Mail,
    subtitle: "Templates, sequences, and the queue waiting to go out.",
  },
  {
    id: "settings",
    label: "Settings",
    icon: Settings,
    subtitle: "Companies, stages, sync, appearance and backups.",
  },
];

export function routeById(id: RouteId): Route {
  const found = ROUTES.find((route) => route.id === id);
  // ROUTES covers every member of RouteId, so this cannot be missing.
  if (!found) throw new Error(`Unknown route: ${id}`);
  return found;
}
