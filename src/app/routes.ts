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
  NotebookPen,
  Sprout,
} from "lucide-react";

/**
 * A handful of screens and no deep linking, so a router library would be all
 * cost and no benefit. Navigation is a union type plus useState in App.
 *
 * Plan and You are yours; the company group is headed by the company itself,
 * which is where it is chosen, with Contacts, Deals, Money and Brain under
 * it; Settings at the foot. A row is a claim that a thing is opened most days; Brain breaks that
 * on purpose, because it is the one place for everything that is not a list
 * of work, and a thing that cannot be found in two keystrokes is a thing
 * nobody writes down (PLAN.md, part two). Import is a screen without a row:
 * it is something done to the contacts list a handful of times, so it is a
 * button on Contacts and keeps a way back.
 *
 * The map has no row either. It is reached from the Brain, where it draws the
 * company, and from Memories, where it draws yours - a question people come
 * to with something already open, not a place they start from. It highlights
 * Brain, whose rail it also sits on.
 *
 * There is one workspace per company and no other kind. The degree and the
 * company are one calendar and one task list, and *area* is the only tag.
 * See PLAN.md for what was removed and why.
 *
 * *You* is the founder's own: the journal, opened most evenings; Life -
 * studies, hobbies, goals; and Memories, everything the line on Today was told
 * to keep. They are brain pages underneath, so they link and search like the
 * rest, but they are the person's rather than the company's, so they live
 * here, a key away, and never in the company brain.
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
  | "journal"
  | "life"
  | "memories"
  | "settings"
  | "setup";

/** The sidebar's sections. "app" is Settings, on its own at the foot. */
type RouteGroup = "plan" | "you" | "company" | "app";

/** Company has no label: its heading is the company itself, and the switcher. */
export const GROUP_LABEL: Record<RouteGroup, string> = {
  plan: "Plan",
  you: "You",
  company: "",
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
  { id: "journal", label: "Journal", icon: NotebookPen, group: "you" },
  { id: "life", label: "Life", icon: Sprout, group: "you" },
  // Yours, whichever company is open, so here and not on the company's Brain.
  { id: "memories", label: "Memories", icon: BookHeart, group: "you" },
  { id: "leads", label: "Contacts", icon: Users, group: "company" },
  { id: "import", label: "Import", icon: Upload, group: "company", parent: "leads" },
  { id: "pipeline", label: "Deals", icon: KanbanSquare, group: "company" },
  { id: "money", label: "Money", icon: Wallet, group: "company" },
  { id: "brain", label: "Brain", icon: Brain, group: "company" },
  // The brain drawn: every page, contact and link, as one picture. Opened from
  // the Brain and from Memories rather than a row of its own, because how
  // things connect is a question asked of something already in front of you.
  { id: "map", label: "Map", icon: Waypoints, group: "company", parent: "brain" },
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
  const groups: RouteGroup[] = ["plan", "you", "company", "app"];
  return groups.map((group) => ({
    group,
    routes: ROUTES.filter((route) => route.group === group && !route.parent),
  }));
}

/** Where the app opens. */
export const DEFAULT_ROUTE: RouteId = "today";
