import { dialog, shell } from "electron";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { CHANNELS } from "@shared/ipc";
import { DOCUMENT_CATEGORIES, type DocumentCategory } from "@shared/deadlines";
import { isDay } from "@shared/dates";
import { getDatabase } from "../db/connection";
import { assertId, handle } from "./handle";
import { attachmentsDir, copyIntoStore } from "../services/files";
import { deleteDocument, listDocuments, recordDocument, storedFile, updateDocument } from "../repositories/documents";
import { doneFor } from "../repositories/obligations";
import {
  addDeadline,
  addPresetDeadlines,
  buildDeadlines,
  editDeadline,
  markDeadlineDone,
  removeDeadline,
  undoDeadline,
} from "../services/deadlines";

/**
 * Documents and deadlines from the window.
 *
 * A document is named by id and main finds its file, as attachments always
 * were: no path crosses the bridge in either direction.
 */
export function registerDeadlineHandlers(): void {
  const companyOf = (value: unknown) => assertId(value, "company id");
  const obligationOf = (value: unknown) => assertId(value, "deadline id");
  const dueOf = (value: unknown) => {
    if (typeof value !== "string" || !isDay(value)) throw new Error("That is not a day.");
    return value;
  };

  /* ---- Documents ---- */

  const listFor = (companyId: string, leadId: string | null) =>
    listDocuments(getDatabase(), companyId, leadId ? { leadId } : {});

  handle(CHANNELS.documentsList, (_event, companyId: unknown, leadId: unknown) =>
    listFor(companyOf(companyId), typeof leadId === "string" && leadId ? assertId(leadId, "contact id") : null),
  );

  handle(CHANNELS.documentsAdd, async (_event, companyId: unknown, owner: unknown) => {
    const company = companyOf(companyId);
    const given = (typeof owner === "object" && owner !== null ? owner : {}) as Record<string, unknown>;
    const leadId = typeof given["leadId"] === "string" && given["leadId"] ? assertId(given["leadId"], "contact id") : null;
    const pageId = typeof given["pageId"] === "string" && given["pageId"] ? assertId(given["pageId"], "page id") : null;
    const category: DocumentCategory = (DOCUMENT_CATEGORIES as readonly unknown[]).includes(given["category"])
      ? (given["category"] as DocumentCategory)
      : "other";
    const expiresOn = typeof given["expiresOn"] === "string" && isDay(given["expiresOn"]) ? given["expiresOn"] : null;

    const picked = await dialog.showOpenDialog({
      title: leadId ? "Attach a file" : "Add a document",
      properties: ["openFile", "multiSelections"],
    });
    if (picked.canceled || picked.filePaths.length === 0) return null;

    for (const source of picked.filePaths) {
      // Copied rather than linked: a file that lives wherever it was when it
      // was added goes missing the first time somebody tidies Downloads.
      const stored = await copyIntoStore(source);
      recordDocument(
        getDatabase(),
        company,
        { name: stored.name, category, leadId, pageId, expiresOn },
        { stored: stored.stored, bytes: stored.bytes },
      );
    }
    return listFor(company, leadId);
  });

  handle(CHANNELS.documentsRecord, (_event, companyId: unknown, raw: unknown) => {
    const company = companyOf(companyId);
    const saved = recordDocument(getDatabase(), company, raw);
    return listFor(company, saved.leadId);
  });

  handle(CHANNELS.documentsUpdate, (_event, id: unknown, raw: unknown) =>
    updateDocument(getDatabase(), assertId(id, "document id"), raw),
  );

  handle(CHANNELS.documentsOpen, async (_event, id: unknown) => {
    const found = storedFile(getDatabase(), assertId(id, "document id"));
    if (!found) throw new Error("That document no longer exists.");
    if (!found.file) throw new Error("That document is not stored here; its notes say where it is.");
    const problem = await shell.openPath(join(attachmentsDir(), found.file));
    if (problem) throw new Error(problem);
  });

  handle(CHANNELS.documentsRemove, (_event, id: unknown) => {
    const documentId = assertId(id, "document id");
    const found = storedFile(getDatabase(), documentId);
    if (!found) throw new Error("That document no longer exists.");
    // The row goes first. A file deleted while the row survived would leave a
    // list of things that cannot be opened; a row deleted while the file
    // survived leaves only a stray file.
    const file = deleteDocument(getDatabase(), documentId);
    if (file) rmSync(join(attachmentsDir(), file), { force: true });
    return listFor(found.companyId, found.leadId);
  });

  /* ---- Deadlines ---- */

  handle(CHANNELS.deadlinesOverview, (_event, companyId: unknown) => buildDeadlines(getDatabase(), companyOf(companyId)));

  handle(CHANNELS.deadlinesCreate, (_event, companyId: unknown, raw: unknown) =>
    addDeadline(getDatabase(), companyOf(companyId), raw),
  );

  handle(CHANNELS.deadlinesUpdate, (_event, id: unknown, raw: unknown) => editDeadline(getDatabase(), obligationOf(id), raw));

  handle(CHANNELS.deadlinesRemove, (_event, id: unknown) => removeDeadline(getDatabase(), obligationOf(id)));

  handle(CHANNELS.deadlinesDone, (_event, id: unknown, dueOn: unknown) =>
    markDeadlineDone(getDatabase(), obligationOf(id), dueOf(dueOn)),
  );

  handle(CHANNELS.deadlinesUndo, (_event, id: unknown, dueOn: unknown) =>
    undoDeadline(getDatabase(), obligationOf(id), dueOf(dueOn)),
  );

  handle(CHANNELS.deadlinesAddPresets, (_event, companyId: unknown, ids: unknown) => {
    if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string")) throw new Error("Pick the deadlines to add.");
    return addPresetDeadlines(getDatabase(), companyOf(companyId), ids as string[]);
  });

  handle(CHANNELS.deadlinesHistory, (_event, id: unknown) => doneFor(getDatabase(), obligationOf(id)));
}
