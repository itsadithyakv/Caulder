import type { ReactNode } from "react";

/**
 * Nothing here yet: the fact, then the next action.
 *
 * The voice rule from design-language.md, made into a shape so it cannot
 * drift: a title that states what is missing, one sentence at most about
 * what fills it, and the buttons that do so. No exclamation marks.
 */
export function EmptyState({
  icon,
  title,
  body,
  actions,
}: {
  icon?: ReactNode;
  title: ReactNode;
  body?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="empty">
      {icon}
      <p className="empty__title">{title}</p>
      {body && <p className="empty__body">{body}</p>}
      {actions && <div className="empty__actions">{actions}</div>}
    </div>
  );
}
