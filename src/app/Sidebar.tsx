import { ChevronsUpDown } from "lucide-react";
import { ROUTES, type RouteId } from "./routes";
import type { Company } from "@shared/domain";

type Props = {
  current: RouteId;
  onNavigate: (id: RouteId) => void;
  company: Company | null;
  switcherOpen: boolean;
  onToggleSwitcher: () => void;
  /** Overdue count, surfaced on the Today row because it is the thing that rots. */
  overdueCount: number;
};

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return (words[0] ?? "").slice(0, 2).toUpperCase();
  return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? "")).toUpperCase();
}

export function Sidebar({
  current,
  onNavigate,
  company,
  switcherOpen,
  onToggleSwitcher,
  overdueCount,
}: Props) {
  return (
    <nav className="sidebar" aria-label="Main">
      <button
        type="button"
        className="company"
        onClick={onToggleSwitcher}
        aria-haspopup="menu"
        aria-expanded={switcherOpen}
        aria-label={company ? `Company: ${company.name}. Switch company` : "Switch company"}
      >
        <span className="company__mark" aria-hidden>
          {company ? initials(company.name) : "--"}
        </span>
        <span className="company__text">
          <span className="company__name">{company ? company.name : "No company"}</span>
          <span className="company__meta">
            {company
              ? `${company.leadCount} ${company.leadCount === 1 ? "lead" : "leads"}`
              : "Create one to start"}
          </span>
        </span>
        <ChevronsUpDown size={15} className="company__chevron" aria-hidden />
      </button>

      <div className="sidebar__nav">
        {ROUTES.map((route) => {
          const Icon = route.icon;
          const isCurrent = route.id === current;
          const showOverdue = route.id === "today" && overdueCount > 0;

          return (
            <button
              key={route.id}
              type="button"
              className="navitem"
              aria-current={isCurrent ? "page" : undefined}
              onClick={() => onNavigate(route.id)}
            >
              <Icon size={17} className="navitem__icon" aria-hidden />
              {route.label}
              {showOverdue && (
                // Keyed on the number so it remounts and pops when it goes up.
                // The one count in the app allowed to announce itself: it is
                // the alarm, and a silent increment is how a late call stays
                // late.
                <span
                  key={overdueCount}
                  className="navitem__count navitem__count--danger anim-pop"
                >
                  {overdueCount}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
