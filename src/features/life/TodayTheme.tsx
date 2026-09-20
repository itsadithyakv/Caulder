import { themeOn } from "@shared/goals";
import { useDayThemes } from "./useDayThemes";

/** What today is for, in Today's line under its heading - "Guitar day" - when your week gives it one. */
export function TodayTheme({ companyId, day }: { companyId: string | null; day: string }) {
  const theme = themeOn(useDayThemes(companyId), day);
  return theme ? <span className="today__theme">{theme.label} day</span> : null;
}
