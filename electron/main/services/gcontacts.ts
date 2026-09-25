import type { ContactsPull } from "@shared/ipc";
import { contactSheet, type GooglePerson } from "@shared/gcontacts";
import { callScript } from "./gsync";
import { registerFile } from "./import";

/**
 * Your Google address book, fetched once, into the import wizard.
 *
 * **Nothing about this runs on a timer.** The calendar and tasks sync both
 * ways in the background because a task is meant to reach a phone; an address
 * book is not, and quietly reading the people in somebody's life is not a
 * feature. It happens when the button is pressed and not otherwise.
 *
 * It arrives as a sheet and goes through `registerFile`, so it meets the same
 * mapping, the same duplicate detection against contacts already here, the
 * same one transaction and the same undo that a spreadsheet does. A second
 * import path that skipped the preview would be a second way to get it wrong,
 * and this is the one source where the rows were not chosen by hand.
 *
 * Recorded as a `csv`, the way a pasted list already is - the batch's name
 * carries where it really came from, and so does every row's Source column.
 * `import_batches.file_type` has a CHECK with two values in it, and widening
 * a CHECK in SQLite means rebuilding the table.
 */
export async function pullGoogleContacts(): Promise<ContactsPull> {
  let answer: { contacts?: GooglePerson[]; complete?: boolean };
  try {
    answer = await callScript<{ contacts?: GooglePerson[]; complete?: boolean }>("pullContacts", {});
  } catch (error) {
    // A script from before this feature answers its own default branch, and
    // "this script does not do pullContacts" is true but not something a
    // person can act on. What they need is the sentence that says where the
    // new script is.
    const said = error instanceof Error ? error.message : String(error);
    if (said.includes("does not do")) {
      throw new Error(
        "The Google script in your account is older than this copy of Caulder and cannot read contacts yet. Settings > Google has the new one to paste in.",
      );
    }
    throw error;
  }

  const sheet = contactSheet(answer.contacts ?? []);
  if (sheet.rows.length === 0) {
    throw new Error(
      sheet.skipped > 0
        ? "Google returned contacts, but none of them had a name to file them under."
        : "There are no contacts in that Google account yet.",
    );
  }

  return {
    file: registerFile("Google Contacts", "csv", sheet),
    skipped: sheet.skipped,
    // Absent means the script is an older one that always read everything it
    // could; treating that as finished is the answer it would have given.
    complete: answer.complete !== false,
  };
}
