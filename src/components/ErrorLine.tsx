import type { ReactNode } from "react";

/** Something went wrong, said once, above the thing it is about. */
export function ErrorLine({ children, className }: { children: ReactNode; className?: string }) {
  if (!children) return null;
  return (
    <p className={className ? `field__error ${className}` : "field__error"} role="alert">
      {children}
    </p>
  );
}
