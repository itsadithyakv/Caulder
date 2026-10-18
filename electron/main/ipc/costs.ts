import { CHANNELS } from "@shared/ipc";
import { getDatabase } from "../db/connection";
import { assertId, handle } from "./handle";
import { buildCosts, forgetBalance, recordBalance, renewCost } from "../services/costs";
import { askBrain, askState, connect, disconnect, previewAsk, refreshModels, setContext, setLineMode, setModel, setScope } from "../services/ask";
import { readLine } from "../services/askline";
import { proposeBrief, proposeNoticed, proposeSort, proposeTidy } from "../services/propose";
import { briefOf } from "../services/relevant";
import { understandingOn } from "../services/understand";
import { modelHere, readLines } from "../understand/host";

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
  handle(CHANNELS.askQuestion, (_event, companyId: unknown, raw: unknown) => {
    const db = getDatabase();
    // Chosen by meaning as well as words when understanding is on (phase 22).
    return askBrain(db, assertId(companyId, "company id"), raw, new Date(), understandingOn(db) && modelHere() ? readLines : null);
  });

  /** The model on this machine, when understanding is on: who and what a line or a question means. */
  const reader = () => (understandingOn(getDatabase()) && modelHere() ? readLines : null);
  const companyOf = (value: unknown) => assertId(value, "company id");
  handle(CHANNELS.askSetScope, (_event, scope: unknown) => setScope(getDatabase(), scope));
  handle(CHANNELS.askSetLine, (_event, on: unknown) => setLineMode(getDatabase(), on));
  handle(CHANNELS.askPreview, (_event, companyId: unknown, raw: unknown) => previewAsk(getDatabase(), companyOf(companyId), raw, new Date(), reader()));
  handle(CHANNELS.askLine, (_event, companyId: unknown, raw: unknown) => readLine(getDatabase(), companyOf(companyId), raw, new Date(), reader()));
  handle(CHANNELS.askBrief, (_event, companyId: unknown) => briefOf(getDatabase(), companyOf(companyId)));
  // Drafts only: each hands back text for the window to show. Keeping one goes through the page's own save.
  handle(CHANNELS.askProposeBrief, (_event, companyId: unknown) => proposeBrief(getDatabase(), companyOf(companyId)));
  handle(CHANNELS.askProposeTidy, (_event, companyId: unknown, pageId: unknown) =>
    proposeTidy(getDatabase(), companyOf(companyId), assertId(pageId, "page id")),
  );
  handle(CHANNELS.askProposeNoticed, (_event, companyId: unknown) => proposeNoticed(getDatabase(), companyOf(companyId)));
  handle(CHANNELS.askProposeSort, (_event, companyId: unknown, pageId: unknown) =>
    proposeSort(getDatabase(), companyOf(companyId), assertId(pageId, "page id")),
  );
}
