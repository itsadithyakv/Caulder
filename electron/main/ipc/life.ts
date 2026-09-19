import { CHANNELS } from "@shared/ipc";
import { getDatabase } from "../db/connection";
import { assertId, handle } from "./handle";
import { newLinkedPage } from "../services/brain";
import { addHabit, archiveHabit, editHabit, listHabits, removeHabit, tickHabit } from "../services/habits";
import { addTile, editTile, listTiles, moveTile, removeTile } from "../services/vision";
import { progress } from "../services/progress";
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
  handle(CHANNELS.lifeLogTime, (_event, pageId: unknown, minutes: unknown) => logTime(getDatabase(), pageOf(pageId), minutes));

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
}
