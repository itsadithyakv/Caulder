import { CHANNELS } from "@shared/ipc";
import { getDatabase } from "../db/connection";
import { assertId, handle } from "./handle";
import { buildCosts, forgetBalance, recordBalance, renewCost } from "../services/costs";
import { askBrain, askState, connect, disconnect, refreshModels, setContext, setModel } from "../services/ask";

/**
 * Running costs and runway from the window. Every change hands back the whole
 * overview: a renewal moves the list, the spend and the runway at once.
 */
export function registerCostHandlers(): void {
  const companyOf = (value: unknown) => assertId(value, "company id");

  handle(CHANNELS.costsOverview, (_event, companyId: unknown) => buildCosts(getDatabase(), companyOf(companyId)));

  handle(CHANNELS.costsRenew, (_event, companyId: unknown, pageId: unknown) =>
    renewCost(getDatabase(), companyOf(companyId), assertId(pageId, "page id")),
  );

  handle(CHANNELS.costsAddBalance, (_event, companyId: unknown, raw: unknown) =>
    recordBalance(getDatabase(), companyOf(companyId), raw),
  );

  handle(CHANNELS.costsDeleteBalance, (_event, companyId: unknown, id: unknown) =>
    forgetBalance(getDatabase(), companyOf(companyId), assertId(id, "balance id")),
  );
}

/** Ask the brain from the window. The key only ever travels inwards. */
export function registerAskHandlers(): void {
  handle(CHANNELS.askState, () => askState(getDatabase()));
  handle(CHANNELS.askConnect, (_event, raw: unknown) => connect(getDatabase(), raw));
  handle(CHANNELS.askDisconnect, () => disconnect(getDatabase()));
  handle(CHANNELS.askSetModel, (_event, model: unknown) => setModel(getDatabase(), model));
  handle(CHANNELS.askSetContext, (_event, size: unknown) => setContext(getDatabase(), size));
  handle(CHANNELS.askRefreshModels, () => refreshModels(getDatabase()));
  handle(CHANNELS.askQuestion, (_event, companyId: unknown, raw: unknown) =>
    askBrain(getDatabase(), assertId(companyId, "company id"), raw),
  );
}
