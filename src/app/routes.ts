import type { LucideIcon } from "lucide-react";
import {
  Waypoints,
  BookHeart,
  Brain,
  CalendarCheck,
  CalendarRange,
  Users,
  KanbanSquare,
  Upload,
  Wallet,
  Settings,
  Rocket,
} from "lucide-react";

/**
 * A handful of screens and no deep linking, so a router library would be all
 * cost and no benefit. Navigation is a union type plus useState in App.
 *
 * The company heads the sidebar, which is where it is chosen. Under it,
 * your time (Today, Calendar), then Contacts, Deals, Money and Brain, with
 * no labels; Settings at the foot. A row is a claim
 * that a thing is opened most days; Brain breaks that on purpose, because it
 * is the one place for everything that is not a list of work, and a thing
 * that cannot be found in two keystrokes is a thing nobody writes down.
 * Import is a screen without a row: it is something done to the contacts list
 * a handful of times, so it is a button on Contacts and keeps a way back.
 *
 * The map and Memories have no row either. Both are reached from the Brain,
 * whose pages they draw and list, and both highlight it.
 *
 * Caulder is the company's and nothing else's: the journal, Life and the
 * rest of the personal half were taken out on 10 October 2026 (PLAN.md, part
 * seven). The calendar still holds the whole day - a class and the gym are
 * what a call is planned around - and *area* is the only tag.
 */
export type RouteId =
  | "today"
  | "day"
  | "leads"
  | "pipeline"
  | "money"
  | "import"
  | "brain"
  | "map"
  | "memories"
  | "settings"
  | "setup";

/** The sidebar's sections. "app" is Settings, on its own at the foot. */
type RouteGroup = "plan" | "company" | "app";

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
  { id: "leads", label: "Contacts", icon: Users, group: "company" },
  { id: "import", label: "Import", icon: Upload, group: "company", parent: "leads" },
  { id: "pipeline", label: "Deals", icon: KanbanSquare, group: "company" },
  { id: "money", label: "Money", icon: Wallet, group: "company" },
  { id: "brain", label: "Brain", icon: Brain, group: "company" },
  // The brain drawn: every page, contact and link, as one picture. Opened from
  // the Brain and from Memories rather than a row of its own, because how
  // things connect is a question asked of something already in front of you.
  { id: "map", label: "Map", icon: Waypoints, group: "company", parent: "brain" },
  // What the line was told to keep about the company, read back off its pages.
  { id: "memories", label: "Memories", icon: BookHeart, group: "company", parent: "brain" },
  { id: "settings", label: "Settings", icon: Settings, group: "app" },
  // The setup guide: shown once when a company is made, and afterwards from
  // Settings, which is where somebody looks for "connect Google".
  { id: "setup", label: "Setting up", icon: Rocket, group: "app", parent: "settings" },
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
  const groups: RouteGroup[] = ["plan", "company", "app"];
  return groups.map((group) => ({
    group,
    routes: ROUTES.filter((route) => route.group === group && !route.parent),
  }));
}

/** Where the app opens. */
export const DEFAULT_ROUTE: RouteId = "today";
