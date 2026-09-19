import type { ReactNode } from "react";

/**
 * A section of a screen: a raised surface with a heading, an optional line
 * under it, and an optional control on the right of the heading.
 *
 * Every screen was building this by hand - `section.card`, `h2.card__title`,
 * `p.card__hint`, and a `.section-head` row where a button was needed - so
 * the same thing came out with different spacing on every screen. One
 * component, one shape.
 *
 * `hint` is one sentence about what the section holds. It is not the place
 * for the reasoning behind it; that goes in an `Explain`, closed by default,
 * or in reference/. A card that explains itself on every visit is a card
 * that has stopped being read.
 */
export function Card({
  title,
  icon,
  hint,
  actions,
  className,
  tone,
  children,
}: {
  title?: ReactNode;
  /** A small icon before the title. Decorative: the title carries the meaning. */
  icon?: ReactNode;
  hint?: ReactNode;
  /** Sits on the right of the title row: a button, a count, a link. */
  actions?: ReactNode;
  className?: string;
  /** Alert and warn tint the card. Colour plus label, never colour alone. */
  tone?: "alert" | "warn";
  children?: ReactNode;
}) {
  const classes = ["card", tone ? `card--${tone}` : null, className].filter(Boolean).join(" ");

  return (
    <section className={classes}>
      {title !== undefined && (
        <div className={actions ? "section-head" : "card__head"}>
          <h2 className="card__title">
            {icon}
            {title}
          </h2>
          {actions}
        </div>
      )}
      {hint && <p className="card__hint">{hint}</p>}
      {children}
    </section>
  );
}
