import { CHANNELS } from "@shared/ipc";
import { getDatabase } from "../db/connection";
import { assertId, handle } from "./handle";
import { logCall } from "../repositories/calls";
import { callContext, startScript } from "../services/calls";
import { openDialler } from "../services/outreach";

/**
 * Calls from the window: what the prompter opens with, a number handed to the
 * dialler by contact rather than by digits, a script started from a tone, and
 * the call written down once it is over.
 */
export function registerCallHandlers(): void {
  const leadOf = (value: unknown) => assertId(value, "contact id");
  const companyOf = (value: unknown) => assertId(value, "company id");

  handle(CHANNELS.callsContext, (_event, leadId: unknown) => callContext(getDatabase(), leadOf(leadId)));

  handle(CHANNELS.callsDial, (_event, leadId: unknown, which: unknown) => {
    openDialler(getDatabase(), leadOf(leadId), which === "alt" ? "alt" : "phone");
  });

  handle(CHANNELS.callsStartScript, (_event, companyId: unknown, tone: unknown) =>
    startScript(getDatabase(), companyOf(companyId), tone, new Date()),
  );

  handle(CHANNELS.callsLog, (_event, companyId: unknown, raw: unknown) =>
    logCall(getDatabase(), companyOf(companyId), raw),
  );
}
