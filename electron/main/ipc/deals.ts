import { CHANNELS } from "@shared/ipc";
import { dealInput } from "@shared/domain";
import { getDatabase } from "../db/connection";
import { assertId, handle } from "./handle";
import {
  createDeal,
  deleteDeal,
  findDeal,
  listDeals,
  setDealLoss,
  setDealStage,
  updateDeal,
} from "../repositories/deals";

/**
 * Deals from the window: a contact's list, and each deal's own changes. The
 * ones that change a contact's list hand back the whole list, which is short
 * and can reorder when a deal closes.
 */
export function registerDealHandlers(): void {
  const dealOf = (value: unknown) => assertId(value, "deal id");
  const stageOf = (value: unknown) => (typeof value === "string" && value.length > 0 ? value : null);

  handle(CHANNELS.dealsForLead, (_event, leadId: unknown) =>
    listDeals(getDatabase(), assertId(leadId, "contact id")),
  );

  handle(CHANNELS.dealsCreate, (_event, leadId: unknown, raw: unknown) => {
    const id = assertId(leadId, "contact id");
    createDeal(getDatabase(), id, dealInput.parse(raw));
    return listDeals(getDatabase(), id);
  });

  handle(CHANNELS.dealsUpdate, (_event, id: unknown, raw: unknown) => {
    const deal = updateDeal(getDatabase(), dealOf(id), dealInput.parse(raw));
    return listDeals(getDatabase(), deal.leadId);
  });

  handle(CHANNELS.dealsSetStage, (_event, id: unknown, stageId: unknown) =>
    setDealStage(getDatabase(), dealOf(id), stageOf(stageId)),
  );

  handle(CHANNELS.dealsSetLoss, (_event, id: unknown, reason: unknown) => {
    const text = typeof reason === "string" ? reason.trim().slice(0, 200) : "";
    return setDealLoss(getDatabase(), dealOf(id), text === "" ? null : text);
  });

  handle(CHANNELS.dealsDelete, (_event, id: unknown) => {
    const deal = findDeal(getDatabase(), dealOf(id));
    if (!deal) throw new Error("That deal no longer exists.");
    deleteDeal(getDatabase(), deal.id);
    return listDeals(getDatabase(), deal.leadId);
  });
}
