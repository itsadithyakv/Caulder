/**
 * Turning spreadsheet cells into lead fields.
 *
 * Every rule here exists because `D:\MyFiles\LeadsUnifloe.xlsx` contains the
 * thing it handles. Nothing is defensive in the abstract.
 *
 * Pure functions with no Node or Electron dependency, so the preview can run
 * the same code the commit does.
 */

/**
 * Values that mean "we did not find this", written out longhand by whoever
 * built the sheet. They must become null, or the app shows "Not mentioned" as
 * though it were an email address.
 */
const SENTINELS = new Set([
  "",
  "-",
  "--",
  "n/a",
  "na",
  "none",
  "nil",
  "null",
  "unknown",
  "not mentioned",
  "not clearly mentioned",
  "not available",
  "not found",
  "no",
]);

/**
 * Coerces any cell to a trimmed string.
 *
 * Three cases from the real file that a plain `String(value)` gets wrong:
 * one phone is stored as a *number*, so it arrives as 9480040338 rather than
 * text; the email cells in the first eight rows are exceljs hyperlink objects
 * shaped `{ text, hyperlink }`; and a formula cell arrives as `{ result }`.
 */
export function text(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") {
    // Whole numbers must not pick up an exponent or a decimal tail: a phone
    // written as 9.48000409e9 is not a phone any more.
    return Number.isInteger(value) ? String(value) : String(value).trim();
  }
  if (typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString();

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    // Hyperlink cell, rich text, or a formula result.
    if (typeof record["text"] === "string") return record["text"].trim();
    if (typeof record["hyperlink"] === "string") {
      return record["hyperlink"].replace(/^mailto:/i, "").trim();
    }
    if (record["result"] !== undefined) return text(record["result"]);
    if (Array.isArray(record["richText"])) {
      return (record["richText"] as { text?: string }[])
        .map((part) => part.text ?? "")
        .join("")
        .trim();
    }

    // An error cell - #N/A, #REF!, #DIV/0! - is exceljs's way of saying there
    // is no value here, and that is exactly how it should be read. Left to the
    // fallback below it became the string "[object Object]", which then passed
    // every sentinel check and imported as a lead genuinely named that.
    if (typeof record["error"] === "string") return "";
  }

  // Anything else object-shaped. Whatever it is, "[object Object]" is never
  // the answer the spreadsheet meant, so it is read as blank rather than
  // written into the database.
  const fallback = String(value).trim();
  return fallback === "[object Object]" ? "" : fallback;
}

/** A cell's value, or null when it is blank or one of the sentinels. */
export function clean(value: unknown): string | null {
  const raw = text(value);
  if (raw === "") return null;
  return SENTINELS.has(raw.toLowerCase()) ? null : raw;
}

/**
 * The file uses an en dash before every PIN code, and a mix of dash
 * characters elsewhere. Folding them to a plain hyphen makes every later rule
 * a single case rather than four.
 */
function normaliseDashes(value: string): string {
  return value.replace(/[\u2010-\u2015\u2212]/g, "-").replace(/\s+/g, " ").trim();
}

/**
 * Splits a cell holding more than one value. The file separates phone numbers
 * and, in one row, whole addresses with " / ".
 */
function splitMulti(value: string): string[] {
  return value
    .split(/\s*[/,;]\s*/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/* ---- Name and source ---------------------------------------------------- */

/**
 * Six rows smuggle provenance into the name: "TRIO World School / Prajna
 * Vahini listing". The name is the school; the rest is where the row came
 * from, which belongs in Source.
 *
 * Only a trailing fragment ending in "listing" is treated this way. A slash
 * inside an ordinary name is left alone.
 */
export function splitNameAndSource(raw: string): { name: string; source: string | null } {
  const value = normaliseDashes(raw);
  const match = /^(.*?)\s*\/\s*([^/]*\blisting)\s*$/i.exec(value);
  if (!match) return { name: value, source: null };

  const name = match[1]?.trim() ?? "";
  const source = match[2]?.trim() ?? "";
  // A row that is nothing but "… listing" keeps its name rather than losing it.
  if (name === "") return { name: value, source: null };
  return { name, source };
}

/* ---- Phones ------------------------------------------------------------- */

/**
 * "9480004094 / 9141924141" is two numbers in one cell. The first is the one
 * to call; the rest go to Alt Phone rather than being thrown away.
 */
export function splitPhones(raw: string | null): { phone: string | null; altPhone: string | null } {
  if (raw === null) return { phone: null, altPhone: null };

  const parts = splitMulti(normaliseDashes(raw)).filter(hasDigits);
  if (parts.length === 0) return { phone: null, altPhone: null };

  return {
    phone: parts[0] ?? null,
    altPhone: parts.length > 1 ? parts.slice(1).join(", ") : null,
  };
}

function hasDigits(value: string): boolean {
  return /\d/.test(value);
}

/**
 * The comparison form of a phone number: digits only, with the company's own
 * country code dropped so "+91 9019959088" and "9019959088" - or "+44 7700
 * 900123" and "07700 900123" - are recognised as the same number. India's
 * code when none is given, which is what every number was compared with
 * before companies had countries; none at all when the country is unknown.
 */
export function phoneKey(raw: string | null, dial: string | null = "91"): string | null {
  if (raw === null) return null;
  let digits = raw.replace(/\D/g, "");
  if (dial && digits.length > 10 && digits.startsWith(dial)) digits = digits.slice(dial.length);
  if (digits.length > 10 && digits.startsWith("0")) digits = digits.replace(/^0+/, "");
  return digits.length >= 7 ? digits : null;
}

/* ---- Email -------------------------------------------------------------- */

/** Lowercased and trimmed. Anything that is not an address becomes null. */
export function normaliseEmail(raw: string | null): string | null {
  if (raw === null) return null;
  const value = raw.replace(/^mailto:/i, "").trim().toLowerCase();
  return looksLikeEmail(value) ? value : null;
}

function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(value);
}

/* ---- Location ----------------------------------------------------------- */

/**
 * Pulls a city and a PIN out of a free-text address.
 *
 * The addresses in the file run from bare "Bengaluru" to "Doddakammanahalli,
 * Gottigere PO, Bannerghatta Road, Bengaluru - 560083", and one row holds two
 * complete addresses separated by " / ".
 *
 * The city is taken as the last comma-separated piece of the last
 * slash-separated address, once the PIN is out of the way. That reads the
 * Indian convention of ending an address with the city, and gets 19 of the 20
 * rows right. The exception has no city in it at all.
 */
export function splitLocation(raw: string | null): {
  location: string | null;
  city: string | null;
  pin: string | null;
} {
  if (raw === null) return { location: null, city: null, pin: null };

  const location = normaliseDashes(raw);
  if (location === "") return { location: null, city: null, pin: null };

  // First PIN wins; the two-address row has two, and the first is as good a
  // guess as any.
  const pin = /\b(\d{6})\b/.exec(location)?.[1] ?? null;

  const withoutPin = location.replace(/\s*-?\s*\b\d{6}\b/g, "").trim();
  const lastAddress = withoutPin.split("/").pop() ?? withoutPin;
  const parts = lastAddress
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  const city = parts.length > 0 ? (parts[parts.length - 1] ?? null) : null;

  return { location, city: city || null, pin };
}

/* ---- Value -------------------------------------------------------------- */

/** Whole currency units. Anything unparseable is "not known", not zero. */
export function parseValue(raw: string | null): number | null {
  if (raw === null) return null;
  const digits = raw.replace(/[^\d.-]/g, "");
  if (digits === "") return null;
  const parsed = Number(digits);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed);
}

/* ---- Comparison keys ---------------------------------------------------- */

/**
 * The comparison form of a name or a city. Unifloe's importer settled on
 * exactly this: trim, lowercase in en-IN, collapse whitespace.
 */
export function labelKey(value: string | null): string | null {
  if (value === null) return null;
  const folded = value.trim().toLocaleLowerCase("en-IN").replace(/\s+/g, " ");
  return folded === "" ? null : folded;
}
