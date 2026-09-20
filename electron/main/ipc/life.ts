import { CHANNELS } from "@shared/ipc";
import { getDatabase } from "../db/connection";
import { assertId, handle } from "./handle";
import { newLinkedPage } from "../services/brain";
import { addHabit, archiveHabit, editHabit, listHabits, removeHabit, tickHabit } from "../services/habits";
import { addTile, editTile, listTiles, moveTile, removeTile } from "../services/vision";
import { progress } from "../services/progress";
import { checkIn, dayThemes, goalDetails, setDayTheme, setGoalDone, undoCheckIn } from "../services/goals";
import { changePasscode, forgetPasscode, lockNow, lockState, removePasscode, setPasscode, unlock } from "../services/journal-lock";
import {
  dayRecord,
  findEntry,
  goalsOverview,
  hobbiesOverview,
  jot,
  logTime,
  journalEntry,
  journalMonth,
  journalToday,
  makeTime,
  pageTime,
  setMood,
  stopTime,
  studiesOverview,
} from "../services/life";
import { jotPrivate, privateDay, removePrivate } from "../services/private";
import { hobbyBoards, logMeasures, shelf, shelfAdd, shelfMove, shelfRemove, yearInNumbers } from "../services/tracker";
import { coversOn, fillCovers, forgetCovers, setCovers } from "../services/covers";
import { answerQuietDay, pulse, setPulse } from "../services/pulse";

/** The founder's own half of the brain (PLAN.md, part four, phase 14). */
export function registerLifeHandlers(): void {
  const companyOf = (value: unknown) => assertId(value, "company id");
  const pageOf = (value: unknown) => assertId(value, "page id");

  handle(CHANNELS.lifeEntry, (_event, companyId: unknown, day: unknown) =>
    journalEntry(getDatabase(), companyOf(companyId), day ?? null, new Date()),
  );
  handle(CHANNELS.lifeFind, (_event, companyId: unknown, day: unknown) => findEntry(getDatabase(), companyOf(companyId), day));
  handle(CHANNELS.lifeMood, (_event, pageId: unknown, mood: unknown) => setMood(getDatabase(), pageOf(pageId), mood ?? null));
  handle(CHANNELS.lifeMonth, (_event, companyId: unknown, month: unknown) => journalMonth(getDatabase(), companyOf(companyId), month));
  handle(CHANNELS.lifeToday, (_event, companyId: unknown) => journalToday(getDatabase(), companyOf(companyId)));
  handle(CHANNELS.lifeDay, (_event, companyId: unknown, day: unknown) => dayRecord(getDatabase(), companyOf(companyId), day));
  handle(CHANNELS.lifeStudies, (_event, companyId: unknown) => studiesOverview(getDatabase(), companyOf(companyId)));
  handle(CHANNELS.lifeHobbies, (_event, companyId: unknown) => hobbiesOverview(getDatabase(), companyOf(companyId)));
  handle(CHANNELS.lifeGoals, (_event, companyId: unknown) => goalsOverview(getDatabase(), companyOf(companyId)));
  handle(CHANNELS.lifeTime, (_event, pageId: unknown) => pageTime(getDatabase(), pageOf(pageId)));
  handle(CHANNELS.lifeMakeTime, (_event, pageId: unknown, input: unknown) => makeTime(getDatabase(), pageOf(pageId), input));
  handle(CHANNELS.lifeStopTime, (_event, seriesId: unknown) => stopTime(getDatabase(), assertId(seriesId, "repeat id")));
  handle(CHANNELS.lifeLinkedPage, (_event, fromId: unknown, template: unknown) =>
    newLinkedPage(getDatabase(), pageOf(fromId), template, new Date()),
  );
  handle(CHANNELS.lifeJot, (_event, companyId: unknown, text: unknown) => jot(getDatabase(), companyOf(companyId), text));
  handle(CHANNELS.lifeJotPrivate, (_event, companyId: unknown, input: unknown) => jotPrivate(getDatabase(), companyOf(companyId), input));
  handle(CHANNELS.lifePrivateDay, (_event, companyId: unknown, day: unknown) => {
    if (typeof day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error("That is not a day.");
    return privateDay(getDatabase(), companyOf(companyId), day);
  });
  handle(CHANNELS.lifeLogMeasures, (_event, companyId: unknown, measures: unknown) => logMeasures(getDatabase(), companyOf(companyId), measures));
  handle(CHANNELS.lifeYear, (_event, companyId: unknown, year: unknown) => {
    if (typeof year !== "number" || !Number.isInteger(year) || year < 2000 || year > 2100) throw new Error("That is not a year.");
    return yearInNumbers(getDatabase(), companyOf(companyId), year);
  });
  handle(CHANNELS.lifeShelf, (_event, companyId: unknown) => shelf(getDatabase(), companyOf(companyId)));
  handle(CHANNELS.lifeShelfAdd, (_event, companyId: unknown, input: unknown) => shelfAdd(getDatabase(), companyOf(companyId), input));
  handle(CHANNELS.lifeShelfMove, (_event, id: unknown, status: unknown) => shelfMove(getDatabase(), typeof id === "string" ? id : "", status));
  handle(CHANNELS.lifeShelfRemove, (_event, id: unknown) => shelfRemove(getDatabase(), typeof id === "string" ? id : ""));
  handle(CHANNELS.lifePulse, (_event, companyId: unknown) => pulse(getDatabase(), companyOf(companyId)));
  handle(CHANNELS.lifeQuietDay, (_event, companyId: unknown, day: unknown, answer: unknown) =>
    answerQuietDay(getDatabase(), companyOf(companyId), day, answer),
  );
  handle(CHANNELS.lifeSetPulse, (_event, on: unknown) => setPulse(getDatabase(), on));
  handle(CHANNELS.lifeBoards, (_event, companyId: unknown) => hobbyBoards(getDatabase(), companyOf(companyId)));
  handle(CHANNELS.lifeCovers, () => coversOn(getDatabase()));
  handle(CHANNELS.lifeSetCovers, (_event, on: unknown) => {
    const now = setCovers(getDatabase(), on);
    // Off means none are kept, not only that none are fetched.
    if (!now) forgetCovers(getDatabase());
    return now;
  });
  handle(CHANNELS.lifeFillCovers, (_event, companyId: unknown) => fillCovers(getDatabase(), companyOf(companyId)));
  handle(CHANNELS.lifeRemovePrivate, (_event, id: unknown) => {
    if (typeof id !== "string" || !id) throw new Error("Missing the line.");
    removePrivate(getDatabase(), id);
  });
  handle(CHANNELS.lifeLogTime, (_event, pageId: unknown, minutes: unknown, startsAt: unknown) =>
    logTime(getDatabase(), pageOf(pageId), minutes, new Date(), startsAt),
  );

  /* ---- The journal's passcode ---- */
  handle(CHANNELS.lifeLockState, () => lockState(getDatabase()));
  handle(CHANNELS.lifeLockSet, (_event, companyId: unknown, passcode: unknown) => setPasscode(getDatabase(), companyOf(companyId), passcode));
  handle(CHANNELS.lifeUnlock, (_event, passcode: unknown) => unlock(getDatabase(), passcode));
  handle(CHANNELS.lifeLockNow, () => lockNow(getDatabase()));
  handle(CHANNELS.lifeLockChange, (_event, oldPasscode: unknown, newPasscode: unknown) =>
    changePasscode(getDatabase(), oldPasscode, newPasscode),
  );
  handle(CHANNELS.lifeLockRemove, (_event, passcode: unknown) => removePasscode(getDatabase(), passcode));
  handle(CHANNELS.lifeLockForget, () => forgetPasscode(getDatabase()));

  /* ---- Habits ---- */
  const habitOf = (value: unknown) => assertId(value, "habit id");
  handle(CHANNELS.habitsList, (_event, companyId: unknown, archived: unknown) =>
    listHabits(getDatabase(), companyOf(companyId), new Date(), archived === true),
  );
  handle(CHANNELS.habitsAdd, (_event, companyId: unknown, input: unknown) => addHabit(getDatabase(), companyOf(companyId), input));
  handle(CHANNELS.habitsUpdate, (_event, id: unknown, input: unknown) => editHabit(getDatabase(), habitOf(id), input));
  handle(CHANNELS.habitsArchive, (_event, id: unknown, archived: unknown) => archiveHabit(getDatabase(), habitOf(id), archived === true));
  handle(CHANNELS.habitsRemove, (_event, id: unknown) => removeHabit(getDatabase(), habitOf(id)));
  handle(CHANNELS.habitsTick, (_event, id: unknown, day: unknown, done: unknown) =>
    tickHabit(getDatabase(), habitOf(id), day, done !== false),
  );

  /* ---- The vision board and your level (phase 17) ---- */
  const tileOf = (value: unknown) => assertId(value, "tile id");
  handle(CHANNELS.visionList, (_event, companyId: unknown) => listTiles(getDatabase(), companyOf(companyId)));
  handle(CHANNELS.visionAdd, (_event, companyId: unknown, input: unknown, picture: unknown) =>
    addTile(getDatabase(), companyOf(companyId), input, picture),
  );
  handle(CHANNELS.visionUpdate, (_event, id: unknown, input: unknown) => editTile(getDatabase(), tileOf(id), input));
  handle(CHANNELS.visionMove, (_event, id: unknown, index: unknown) => moveTile(getDatabase(), tileOf(id), index));
  handle(CHANNELS.visionRemove, (_event, id: unknown) => removeTile(getDatabase(), tileOf(id)));
  handle(CHANNELS.progressGet, (_event, companyId: unknown) => progress(getDatabase(), companyOf(companyId)));

  /* ---- Keeping up with goals, and your week (after 0.4) ---- */
  handle(CHANNELS.lifeGoalDetails, (_event, companyId: unknown) => goalDetails(getDatabase(), companyOf(companyId)));
  handle(CHANNELS.lifeCheckIn, (_event, goalId: unknown, input: unknown) => checkIn(getDatabase(), pageOf(goalId), input));
  handle(CHANNELS.lifeUndoCheckIn, (_event, checkinId: unknown) =>
    undoCheckIn(getDatabase(), assertId(checkinId, "check-in id")),
  );
  handle(CHANNELS.lifeGoalDone, (_event, goalId: unknown, done: unknown) => setGoalDone(getDatabase(), pageOf(goalId), done === true));
  handle(CHANNELS.lifeThemes, (_event, companyId: unknown) => dayThemes(getDatabase(), companyOf(companyId)));
  handle(CHANNELS.lifeSetTheme, (_event, companyId: unknown, weekday: unknown, input: unknown) =>
    setDayTheme(getDatabase(), companyOf(companyId), weekday, input ?? null),
  );
}
