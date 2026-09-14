import type { LucideIcon } from "lucide-react";
import {
  CalendarCheck,
  CalendarRange,
  Users,
  KanbanSquare,
  Upload,
  Wallet,
  Settings,
} from "lucide-react";

/**
 * Six screens and no deep linking, so a router library would be all cost and
 * no benefit. Navigation is a union type plus useState in App.
 *
 * Five rows in the sidebar, in two groups, and Settings at the foot. A row is
 * a claim that a thing is opened most days, and each of these is. Import is
 * the one screen without a row: it is something done to the contacts list a
 * handful of times, so it is a button on Contacts and keeps a way back.
 *
 * There is one workspace per company and no other kind. The degree and the
 * company are one calendar and one task list, and *area* is the only tag.
 * See PLAN.md for what was removed and why.
 */
export type RouteId = "today" | "day" | "leads" | "pipeline" | "money" | "import" | "settings";

/** The sidebar's sections. "app" is Settings, on its own at the foot. */
type RouteGroup = "plan" | "sell" | "app";

export const GROUP_LABEL: Record<RouteGroup, string> = {
  plan: "Plan",
  sell: "Sell",
  app: "",
};

type Route = {
  id: RouteId;
  label: string;
  icon: LucideIcon;
  group: RouteGroup;
  /** Reached from inside this screen rather than from the sidebar. */
  parent?: RouteId;
};

// Ids keep their old names (leads, pipeline) because the tables, the IPC and
// the tests do; only what the person reads changed.
const ROUTES: readonly Route[] = [
  { id: "today", label: "Today", icon: CalendarCheck, group: "plan" },
  { id: "day", label: "Calendar", icon: CalendarRange, group: "plan" },
  { id: "leads", label: "Contacts", icon: Users, group: "sell" },
  { id: "import", label: "Import", icon: Upload, group: "sell", parent: "leads" },
  { id: "pipeline", label: "Deals", icon: KanbanSquare, group: "sell" },
  { id: "money", label: "Money", icon: Wallet, group: "sell" },
  { id: "settings", label: "Settings", icon: Settings, group: "app" },
];

export function routeById(id: RouteId): Route {
  const found = ROUTES.find((route) => route.id === id);
  // ROUTES covers every member of RouteId, so this cannot be missing.
  if (!found) throw new Error(`Unknown route: ${id}`);
  return found;
}

/** The screen the sidebar highlights for a route: itself, or its parent. */
export function navRouteOf(id: RouteId): RouteId {
  return routeById(id).parent ?? id;
}

/** The sidebar: its groups, each with the routes that stand on their own. */
export function navFor(): { group: RouteGroup; routes: Route[] }[] {
  const groups: RouteGroup[] = ["plan", "sell", "app"];
  return groups.map((group) => ({
    group,
    routes: ROUTES.filter((route) => route.group === group && !route.parent),
  }));
}

/** Where the app opens. */
export const DEFAULT_ROUTE: RouteId = "today";
