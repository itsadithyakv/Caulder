import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/**
 * A button that opens a short list of things to do: a section's kinds of
 * page, a page's less common actions. One control where there was a row of
 * them, so a screen shows its main action and keeps the rest a click away.
 *
 * The keyboard works as a menu's should: the first item takes focus on
 * opening, the arrows move, Escape closes and hands focus back.
 */

type MenuItem = {
  label: string;
  /** A second line, quieter, saying what it is for. */
  hint?: string;
  icon?: ReactNode;
  danger?: boolean;
  onSelect: () => void;
};

export function MenuButton({
  label,
  icon,
  items,
  className = "btn btn--sm",
  align = "left",
  disabled = false,
  iconOnly = false,
}: {
  label: string;
  icon?: ReactNode;
  items: readonly MenuItem[];
  className?: string;
  /** Which edge of the button the list lines up with. */
  align?: "left" | "right";
  disabled?: boolean;
  /** Just the icon, the label kept for screen readers: a tile's menu, where a word would cover the picture. */
  iconOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    const first = wrap.current?.querySelector<HTMLButtonElement>('[role="menuitem"]');
    first?.focus();
    const away = (event: MouseEvent) => {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);

  function move(event: React.KeyboardEvent<HTMLDivElement>) {
    const buttons = [...(wrap.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])];
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      trigger.current?.focus();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const next = (at + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next]?.focus();
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <div className="menubtn" ref={wrap}>
      <button
        ref={trigger}
        type="button"
        className={className}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        {icon}
        {iconOnly ? <span className="visually-hidden">{label}</span> : label}
        {!iconOnly && <ChevronDown size={13} className="menubtn__chevron" aria-hidden />}
      </button>
      {open && (
        <div
          id={listId}
          className={`menu menu--${align} anim-menu`}
          role="menu"
          aria-label={label}
          onKeyDown={move}
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className={`menu__item${item.danger ? " menu__item--danger" : ""}`}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
            >
              {item.icon}
              <span className="menu__text">
                <span className="menu__label">{item.label}</span>
                {item.hint && <span className="menu__hint">{item.hint}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
