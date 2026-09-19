import { useEffect, useRef } from "react";
import { Check, Plus } from "lucide-react";
import { useWorkspace } from "@/lib/workspace";

/**
 * The list that drops out of the company heading in the sidebar. Companies
 * only: a workspace of the personal kind is you, not a company, and its
 * things are under Plan and You whichever company is chosen - unless it is
 * the only workspace there is.
 *
 * Closes on Escape, on a click outside, and after a choice. Focus moves into
 * the list on open so it is reachable without a mouse.
 */
export function CompanySwitcher({
  onClose,
  onAddCompany,
}: {
  onClose: () => void;
  onAddCompany: () => void;
}) {
  const { companies: all, activeCompany, setActive } = useWorkspace();
  const companies = all.some((c) => c.kind !== "personal") ? all.filter((c) => c.kind !== "personal") : all;
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    panel.current?.querySelector<HTMLElement>("button")?.focus();

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    function onPointer(event: MouseEvent) {
      if (!panel.current) return;
      const target = event.target as Node;
      // The trigger handles its own toggle; closing here too would reopen it.
      if (panel.current.contains(target)) return;
      if ((target as HTMLElement).closest?.(".company")) return;
      onClose();
    }

    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [onClose]);

  async function choose(id: string) {
    if (id !== activeCompany?.id) await setActive(id);
    onClose();
  }

  return (
    <div className="switcher nm-float anim-menu" ref={panel} role="menu" aria-label="Companies">
      <div className="switcher__list">
        {companies.map((company) => {
          const current = company.id === activeCompany?.id;
          return (
            <button
              key={company.id}
              type="button"
              role="menuitemradio"
              aria-checked={current}
              className="switcher__item"
              data-accent={company.accent}
              onClick={() => void choose(company.id)}
            >
              <span className="switcher__dot" aria-hidden />
              <span className="switcher__name">{company.name}</span>
              {current && <Check size={15} className="switcher__tick" aria-hidden />}
            </button>
          );
        })}
      </div>

      <div className="switcher__foot">
        <button
          type="button"
          role="menuitem"
          className="switcher__item switcher__item--action"
          onClick={() => {
            onClose();
            onAddCompany();
          }}
        >
          <Plus size={15} aria-hidden />
          Add a company
        </button>
      </div>
    </div>
  );
}
