import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ChevronsUpDown } from "lucide-react";
import { GROUP_LABEL, navFor, navRouteOf, type RouteId } from "./routes";
import type { Company } from "@shared/domain";

type Props = {
  current: RouteId;
  onNavigate: (id: RouteId) => void;
  company: Company | null;
  switcherOpen: boolean;
  onToggleSwitcher: () => void;
  /** The list of companies, when it is open: it drops from the company heading. */
  switcher: ReactNode;
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
 * The sidebar: where you are, and which company.
 *
 * Plan and You are yours, whichever company is chosen. The company is chosen
 * where its screens are - its name heads Contacts, Deals, Money and Brain -
 * because that is all choosing one changes.
 */
export function Sidebar({
  current,
  onNavigate,
  company,
  switcherOpen,
  onToggleSwitcher,
  switcher,
  overdueCount,
}: Props) {
  const here = navRouteOf(current);

  // The list drops from the company heading. It is drawn outside the rows,
  // which scroll and would clip it, at the heading's measured foot.
  const head = useRef<HTMLButtonElement>(null);
  const [below, setBelow] = useState(0);
  useLayoutEffect(() => {
    const button = head.current;
    const wrap = button?.closest(".sidebar-wrap");
    if (!switcherOpen || !button || !wrap) return;
    setBelow(Math.round(button.getBoundingClientRect().bottom - wrap.getBoundingClientRect().top + 6));
  }, [switcherOpen]);

  return (
    <nav className="sidebar" aria-label="Main" style={{ "--switcher-top": `${below}px` } as CSSProperties}>
      <div className="sidebar__nav">
        {navFor().map((entry) => (
          <div
            key={entry.group}
            className={`navgroup${entry.group === "app" ? " navgroup--foot" : ""}`}
            data-tour={entry.group}
          >
            {entry.group === "company" ? (
              <div className="companyhead">
                <button
                  ref={head}
                  type="button"
                  className="company"
                  onClick={onToggleSwitcher}
                  aria-haspopup="menu"
                  aria-expanded={switcherOpen}
                  aria-label={company ? `Company: ${company.name}. Switch company` : "Switch company"}
                >
                  {/* The company's own colour is here, on its mark - not across the app. */}
                  <span className="company__mark" data-accent={company?.accent} aria-hidden>
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
              </div>
            ) : (
              GROUP_LABEL[entry.group] && (
                <span className="navgroup__label" aria-hidden>
                  {GROUP_LABEL[entry.group]}
                </span>
              )
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
      {switcher}
    </nav>
  );
}
