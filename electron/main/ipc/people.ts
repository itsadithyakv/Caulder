import { CHANNELS } from "@shared/ipc";
import { getDatabase } from "../db/connection";
import { assertId, handle } from "./handle";
import {
  addOpening,
  addPerson,
  buildPeople,
  editOpening,
  editPerson,
  hire,
  moveCandidate,
  onboard,
  personDetail,
  removeOpening,
  removePerson,
} from "../services/people";

/** People and open roles from the window. Every input is parsed again in the repository. */
export function registerPeopleHandlers(): void {
  const companyOf = (value: unknown) => assertId(value, "company id");
  const personOf = (value: unknown) => assertId(value, "person id");
  const openingOf = (value: unknown) => assertId(value, "role id");

  handle(CHANNELS.peopleOverview, (_event, companyId: unknown) => buildPeople(getDatabase(), companyOf(companyId)));

  handle(CHANNELS.peopleDetail, (_event, id: unknown) => personDetail(getDatabase(), personOf(id)));

  handle(CHANNELS.peopleCreate, (_event, companyId: unknown, raw: unknown) =>
    addPerson(getDatabase(), companyOf(companyId), raw),
  );

  handle(CHANNELS.peopleUpdate, (_event, id: unknown, raw: unknown) => editPerson(getDatabase(), personOf(id), raw));

  handle(CHANNELS.peopleRemove, (_event, id: unknown) => removePerson(getDatabase(), personOf(id)));

  handle(CHANNELS.peopleStage, (_event, id: unknown, stage: unknown) =>
    moveCandidate(getDatabase(), personOf(id), stage),
  );

  handle(CHANNELS.peopleHire, (_event, id: unknown, raw: unknown) => hire(getDatabase(), personOf(id), raw));

  handle(CHANNELS.peopleOnboard, (_event, id: unknown, playbookId: unknown) =>
    onboard(
      getDatabase(),
      personOf(id),
      typeof playbookId === "string" && playbookId ? assertId(playbookId, "playbook id") : null,
    ),
  );

  handle(CHANNELS.openingsCreate, (_event, companyId: unknown, raw: unknown) =>
    addOpening(getDatabase(), companyOf(companyId), raw),
  );

  handle(CHANNELS.openingsUpdate, (_event, id: unknown, raw: unknown) => editOpening(getDatabase(), openingOf(id), raw));

  handle(CHANNELS.openingsRemove, (_event, id: unknown) => removeOpening(getDatabase(), openingOf(id)));
}
