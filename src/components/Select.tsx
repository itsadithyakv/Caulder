import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

/**
 * A dropdown that looks like it belongs to this app.
 *
 * The closed native `<select>` could be styled and was. The open one could
 * not: on Windows the list is drawn by the operating system - a flat grey box
 * with a black border and a saturated blue bar across the chosen row - and no
 * stylesheet reaches it. On a soft, rounded, coffee-coloured screen it was the
 * one thing that looked like it had wandered in from another program.
 *
 * So this is a real listbox, built to the ARIA combobox pattern: the button
 * keeps focus throughout and says which option is active with
 * `aria-activedescendant`, so a screen reader follows the arrow keys the way it
 * would a native control. Every key a native select answers to is answered
 * here - the arrows, Home and End, Enter and Space, Escape, Tab, and typing
 * the first letter of an option to jump to it.
 *
 * **The list is portalled onto the document body.** Every animated panel in
 * the app finishes its entrance holding a transform, and a transformed
 * ancestor traps a fixed-position child inside itself - so a list opened in a
 * dialog would have been clipped by the dialog's edge.
 *
 * Short lists of short words should not be a dropdown at all: see `Chips`.
 */

type SelectOption<V extends string> = { value: V; label: string };

type Props<V extends string> = {
  value: V;
  options: readonly SelectOption<V>[];
  onChange: (value: V) => void;
  id?: string;
  "aria-label"?: string;
  disabled?: boolean;
  /** Narrower padding, for a select living inside a table row. */
  compact?: boolean;
  className?: string;
};

/** Far enough from the bottom of the window that the list opens upward instead. */
const FLIP_MARGIN = 16;
const MAX_LIST = 300;

export function Select<V extends string>({
  value,
  options,
  onChange,
  id,
  "aria-label": ariaLabel,
  disabled,
  compact,
  className,
}: Props<V>) {
  const generated = useId();
  const listId = `${generated}-list`;
  const optionId = (index: number) => `${generated}-opt-${index}`;

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [place, setPlace] = useState<{ left: number; top: number; width: number; up: boolean }>({
    left: 0,
    top: 0,
    width: 0,
    up: false,
  });

  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);

  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const current = options[selectedIndex];

  /** Where the list goes, measured from the button every time it opens. */
  const measure = useCallback(() => {
    const box = trigger.current?.getBoundingClientRect();
    if (!box) return;
    const below = window.innerHeight - box.bottom;
    const up = below < Math.min(MAX_LIST, options.length * 40) + FLIP_MARGIN && box.top > below;
    setPlace({ left: box.left, top: up ? box.top : box.bottom, width: box.width, up });
  }, [options.length]);

  const openList = useCallback(() => {
    if (disabled) return;
    measure();
    setActive(selectedIndex);
    setOpen(true);
  }, [disabled, measure, selectedIndex]);

  const choose = useCallback(
    (index: number) => {
      const option = options[index];
      if (option && option.value !== value) onChange(option.value);
      setOpen(false);
      trigger.current?.focus();
    },
    [onChange, options, value],
  );

  // Kept in place while open. A dialog that scrolls, or a window that is
  // resized, would otherwise leave the list hanging where the button was.
  useLayoutEffect(() => {
    if (!open) return;
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, measure]);

  // Anywhere else closes it, the way a native select does.
  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      const target = event.target as Node;
      if (trigger.current?.contains(target) || list.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  // The active row stays in view as the arrows move it.
  useEffect(() => {
    if (!open) return;
    list.current
      ?.querySelector<HTMLElement>(`#${CSS.escape(`${generated}-opt-${active}`)}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [open, active, generated]);

  /** The next option whose label starts with this letter, after `from`. */
  function jump(letter: string, from: number): number | null {
    const lower = letter.toLowerCase();
    for (let step = 1; step <= options.length; step += 1) {
      const index = (from + step) % options.length;
      if (options[index]?.label.toLowerCase().startsWith(lower)) return index;
    }
    return null;
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    const key = event.key;

    if (!open) {
      if (key === "ArrowDown" || key === "ArrowUp" || key === "Enter" || key === " ") {
        event.preventDefault();
        openList();
        return;
      }
      // A letter on a closed select changes it, as a native one does.
      if (key.length === 1 && /\S/.test(key)) {
        const found = jump(key, selectedIndex);
        if (found !== null) {
          event.preventDefault();
          const option = options[found];
          if (option) onChange(option.value);
        }
      }
      return;
    }

    switch (key) {
      case "ArrowDown":
        event.preventDefault();
        setActive((index) => Math.min(options.length - 1, index + 1));
        return;
      case "ArrowUp":
        event.preventDefault();
        setActive((index) => Math.max(0, index - 1));
        return;
      case "Home":
        event.preventDefault();
        setActive(0);
        return;
      case "End":
        event.preventDefault();
        setActive(options.length - 1);
        return;
      case "Enter":
      case " ":
        event.preventDefault();
        choose(active);
        return;
      case "Escape":
        // Handled here and stopped here. A form that closes on Escape is
        // listening on the window, and one press should close the list, not
        // the list and the dialog behind it.
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        return;
      case "Tab":
        setOpen(false);
        return;
      default:
        if (key.length === 1 && /\S/.test(key)) {
          const found = jump(key, active);
          if (found !== null) setActive(found);
        }
    }
  }

  return (
    <>
      <button
        ref={trigger}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? optionId(active) : undefined}
        aria-label={ariaLabel}
        disabled={disabled}
        className={`picker${compact ? " picker--compact" : ""}${open ? " picker--open" : ""}${
          className ? ` ${className}` : ""
        }`}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
      >
        <span className="picker__value">{current?.label ?? ""}</span>
        <ChevronDown size={16} className="picker__chevron" aria-hidden />
      </button>

      {open &&
        createPortal(
          <ul
            ref={list}
            id={listId}
            role="listbox"
            aria-label={ariaLabel}
            className={`picker__list${place.up ? " picker__list--up" : ""}`}
            style={{
              left: place.left,
              minWidth: place.width,
              ...(place.up
                ? { bottom: window.innerHeight - place.top + 6 }
                : { top: place.top + 6 }),
            }}
          >
            {options.map((option, index) => {
              const selected = option.value === value;
              return (
                <li
                  key={option.value}
                  id={optionId(index)}
                  role="option"
                  aria-selected={selected}
                  className={`picker__option${index === active ? " picker__option--active" : ""}${
                    selected ? " picker__option--selected" : ""
                  }`}
                  // Pointer-down rather than click, and kept from taking focus,
                  // so the button never loses it and the outside-click check
                  // never sees this as leaving.
                  onPointerDown={(event) => event.preventDefault()}
                  onPointerEnter={() => setActive(index)}
                  onClick={() => choose(index)}
                >
                  <span className="picker__label">{option.label}</span>
                  {selected && <Check size={15} className="picker__check" aria-hidden />}
                </li>
              );
            })}
          </ul>,
          document.body,
        )}
    </>
  );
}

/**
 * One choice from a few short options, all visible at once.
 *
 * The right control for most of what used to be a dropdown in this app. Five
 * task kinds, four areas, three priorities: a list you have to open to read is
 * a list you read every time, whereas a row of chips is learnt once and then
 * hit without looking. It also fills the width a dropdown was leaving empty.
 */
export function Chips<V extends string>({
  value,
  options,
  onChange,
  "aria-label": ariaLabel,
  disabled,
}: {
  value: V;
  options: readonly SelectOption<V>[];
  onChange: (value: V) => void;
  "aria-label": string;
  disabled?: boolean;
}) {
  return (
    <div className="chips" role="radiogroup" aria-label={ariaLabel}>
      {options.map((option) => {
        const on = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={on}
            className={`chip${on ? " chip--on" : ""}`}
            onClick={() => onChange(option.value)}
            disabled={disabled}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
