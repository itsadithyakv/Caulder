import type { ReactNode } from "react";

/**
 * The reasoning behind a section, closed by default.
 *
 * Caulder has opinions - a note is not contact, a campaign too young to judge
 * is not scored, a streak counts occurrences and not days - and the first
 * version wrote every one of them onto the screen as a paragraph under the
 * heading. Read once, it is the point; read on every visit, it is furniture
 * between the heading and the data.
 *
 * So the sentence that says *what* a section holds stays visible as the
 * card's hint, and the paragraph that says *why* lives here, one click away
 * and out of the way. A native `details` so it costs nothing, is keyboard
 * reachable, and remembers nothing - the reader who wants it opens it.
 */
export function Explain({
  label = "Why it works this way",
  children,
}: {
  label?: string;
  children: ReactNode;
}) {
  return (
    <details className="explain">
      <summary className="explain__summary">{label}</summary>
      <div className="explain__body">{children}</div>
    </details>
  );
}
