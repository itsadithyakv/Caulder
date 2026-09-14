import { ChevronsUpDown } from "lucide-react";
import { GROUP_LABEL, navFor, navRouteOf, type RouteId } from "./routes";
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
  if (words.length === 0) return "--";
  if (words.length === 1) return (words[0] ?? "").slice(0, 2).toUpperCase();
  return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? "")).toUpperCase();
}

/**
 * The sidebar: which company, and where you are.
 *
 * Five rows in two groups. The two labels are the only hierarchy, and they
 * are enough: Today is a morning thing and Email is an afternoon one.
 */
export function Sidebar({
  current,
  onNavigate,
  company,
  switcherOpen,
  onToggleSwitcher,
  overdueCount,
}: Props) {
  const here = navRouteOf(current);

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
          {company?.logo ? (
            <img src={company.logo} alt="" className="company__logo" />
          ) : (
            initials(company?.name ?? "")
          )}
        </span>
        <span className="company__text">
          <span className="company__name">{company ? company.name : "No company"}</span>
          <span className="company__meta">
            {!company
              ? "Create one to start"
              : `${company.leadCount} ${company.leadCount === 1 ? "contact" : "contacts"}`}
          </span>
        </span>
        <ChevronsUpDown size={15} className="company__chevron" aria-hidden />
      </button>

      <div className="sidebar__nav">
        {navFor().map((entry) => (
          <div
            key={entry.group}
            className={`navgroup${entry.group === "app" ? " navgroup--foot" : ""}`}
          >
            {GROUP_LABEL[entry.group] && (
              <span className="navgroup__label" aria-hidden>
                {GROUP_LABEL[entry.group]}
              </span>
            )}
            {entry.routes.map((route) => {
              const Icon = route.icon;
              const showOverdue = route.id === "today" && overdueCount > 0;

              return (
                <button
                  key={route.id}
                  type="button"
                  className="navitem"
                  aria-current={route.id === here ? "page" : undefined}
                  onClick={() => onNavigate(route.id)}
                >
                  <Icon size={17} className="navitem__icon" aria-hidden />
                  {route.label}
                  {showOverdue && (
                    // Keyed on the number so it remounts and pops when it goes
                    // up. The one count in the app allowed to announce itself:
                    // it is the alarm, and a silent increment is how a late
                    // call stays late.
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
        ))}
      </div>
    </nav>
  );
}
