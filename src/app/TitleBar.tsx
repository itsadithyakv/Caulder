import { Minus, Square, X, Sun, Moon, MonitorCog } from "lucide-react";
import type { ThemeChoice } from "@/lib/theme";

const THEME_LABEL: Record<ThemeChoice, string> = {
  system: "Theme: match system",
  light: "Theme: light",
  dark: "Theme: dark",
};

type Props = {
  theme: ThemeChoice;
  onCycleTheme: () => void;
};

export function TitleBar({ theme, onCycleTheme }: Props) {
  const ThemeIcon = theme === "system" ? MonitorCog : theme === "light" ? Sun : Moon;

  return (
    <header className="titlebar">
      <span className="brandmark titlebar__mark" aria-hidden />
      <span className="titlebar__name">Caulder</span>
      <span className="titlebar__spacer" />

      <div className="titlebar__actions">
        <button
          type="button"
          className="btn btn--ghost btn--icon"
          onClick={onCycleTheme}
          title={THEME_LABEL[theme]}
          aria-label={THEME_LABEL[theme]}
        >
          <ThemeIcon size={16} aria-hidden />
        </button>

        <button
          type="button"
          className="wincontrol"
          onClick={() => window.caulder.window.minimize()}
          aria-label="Minimise"
        >
          <Minus size={15} aria-hidden />
        </button>
        <button
          type="button"
          className="wincontrol"
          onClick={() => window.caulder.window.toggleMaximize()}
          aria-label="Maximise"
        >
          <Square size={13} aria-hidden />
        </button>
        <button
          type="button"
          className="wincontrol wincontrol--close"
          onClick={() => window.caulder.window.close()}
          aria-label="Close"
        >
          <X size={16} aria-hidden />
        </button>
      </div>
    </header>
  );
}
