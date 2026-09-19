import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * A screen that fails to draw, caught.
 *
 * Without this, one bad render blanks the whole window and the only way back
 * is to quit - and nothing is written down about why. With it, the sidebar
 * stays, the failure goes to the log, and there are two ways out.
 *
 * A class, because React still offers no other way to catch a render error.
 */
export class ErrorBoundary extends Component<
  { children: ReactNode; onHome: () => void },
  { error: Error | null }
> {
  override state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    try {
      window.caulder.app.reportError(
        `${error.stack ?? error.message}\n${info.componentStack ?? ""}`,
      );
    } catch {
      // The report is a courtesy; the screen below is what matters.
    }
  }

  override render() {
    if (!this.state.error) return this.props.children;

    return (
      <section className="card" role="alert">
        <h2 className="card__title">This screen hit a problem</h2>
        <p className="card__hint">
          {this.state.error.message} Everything you had already saved is safe. The
          details are in the log, which Settings &rsaquo; Your data can open.
        </p>
        <div className="actions">
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => window.location.reload()}
          >
            Reload Caulder
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              this.setState({ error: null });
              this.props.onHome();
            }}
          >
            Go to Today
          </button>
        </div>
      </section>
    );
  }
}
