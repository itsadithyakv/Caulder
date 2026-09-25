import { TEMPLATE_COLUMNS } from "./import";

/**
 * Google Contacts, turned into the rows the importer already understands.
 *
 * No network and no Electron: the script fetches, this decides what each
 * person means, and the import service hands the result to `registerFile`.
 * Everything after that - the mapping, duplicate detection against people you
 * already have, one transaction, undo - is the machinery a spreadsheet
 * already goes through, unchanged. A second import path that skipped the
 * preview would be a second way to get it wrong.
 *
 * The headers are Caulder's own column names, so `guessMapping` matches all
 * of them and there is nothing to map by hand.
 */

/** The parts of a People API person Caulder reads. Everything else is ignored. */
export type GooglePerson = {
  resourceName?: string;
  names?: { displayName?: string; givenName?: string; familyName?: string }[];
  organizations?: { name?: string; title?: string }[];
  emailAddresses?: { value?: string }[];
  phoneNumbers?: { value?: string }[];
  addresses?: { formattedValue?: string; city?: string }[];
  urls?: { value?: string }[];
  biographies?: { value?: string }[];
};

/** Where a row came from, so the batch is recognisable months later. */
const GOOGLE_SOURCE = "Google Contacts";

function first(values: { value?: string }[] | undefined, index = 0): string {
  return (values?.[index]?.value ?? "").trim();
}

function fullName(person: GooglePerson): string {
  const name = person.names?.[0];
  if (!name) return "";
  const display = (name.displayName ?? "").trim();
  if (display) return display;
  return [name.givenName, name.familyName]
    .map((part) => (part ?? "").trim())
    .filter(Boolean)
    .join(" ");
}

/**
 * One person, as a row.
 *
 * **The company is the lead and the human is the contact on it**, which is
 * the same shape `saveContact` writes in the other direction: it files a
 * person under their own name with the company as their organisation. So a
 * contact Caulder pushed to Google and then pulled back reads as the lead it
 * started as, rather than as a second, person-shaped one.
 *
 * Somebody with no organisation is their own lead. For a one-person business
 * - most of a student founder's address book - that is exactly right, and
 * inventing an empty company for them would be worse.
 */
export function contactRow(person: GooglePerson): Record<string, string> | null {
  const human = fullName(person);
  const company = (person.organizations?.[0]?.name ?? "").trim();
  // Google keeps contacts that are only an email address. There is nothing to
  // call such a row, and `Name` is the one column the importer requires.
  if (!human && !company) return null;

  const address = person.addresses?.[0];

  return {
    Name: company || human,
    "Contact Person": company ? human : "",
    Email: first(person.emailAddresses),
    Phone: first(person.phoneNumbers),
    "Alt Phone": first(person.phoneNumbers, 1),
    Location: (address?.formattedValue ?? "").trim(),
    City: (address?.city ?? "").trim(),
    Source: GOOGLE_SOURCE,
    Value: "",
    Website: first(person.urls),
    Notes: (person.biographies?.[0]?.value ?? "").trim(),
  };
}

/**
 * Every person worth importing, as a sheet.
 *
 * The headers are Caulder's own column names in their own order, so the
 * importer's guess is exact and the mapping step has nothing to correct.
 */
export function contactSheet(people: readonly GooglePerson[]): {
  headers: string[];
  rows: unknown[][];
  skipped: number;
} {
  const headers = [...TEMPLATE_COLUMNS];
  const rows: unknown[][] = [];
  let skipped = 0;

  for (const person of people) {
    const row = contactRow(person);
    if (!row) {
      skipped += 1;
      continue;
    }
    rows.push(headers.map((header) => row[header] ?? ""));
  }

  return { headers, rows, skipped };
}
