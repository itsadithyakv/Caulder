import { TEMPLATE_COLUMNS, MAX_ROWS } from "./import";

/**
 * Pasting a list in, rather than having a file to choose.
 *
 * The normal way somebody builds a lead list now is to ask a model for one,
 * and what comes back is a chat message, not a file: a markdown table, usually
 * with a sentence before it and a note after, and sometimes wrapped in a code
 * fence. Saving that to a .csv and then browsing for it is three steps of
 * nothing, so this reads it directly.
 *
 * Everything here is deliberately forgiving about the wrapping and strict
 * about the data. Once a table is found it goes through exactly the same
 * mapping, normalising, duplicate and undo path as a file would — this only
 * gets the rows out of whatever they arrived in.
 */

type Pasted =
  /** Rows already separated. Markdown and tab-separated text need no quoting. */
  | { kind: "table"; headers: string[]; rows: string[][] }
  /** Left as text on purpose, so the real CSV parser handles the quoting. */
  | { kind: "csv"; text: string };

/**
 * The first fenced block, if there is one.
 *
 * A model asked for CSV returns it fenced, with prose either side. The fence
 * is the model saying "this part is the data", so it is taken at its word and
 * everything outside it is dropped.
 */
function insideFence(text: string): string | null {
  const match = /```[^\n]*\n([\s\S]*?)```/.exec(text);
  return match?.[1] ?? null;
}

/** A markdown separator row: |---|:---:|---| and its many variants. */
function isSeparator(line: string): boolean {
  const cells = splitRow(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{1,}:?$/.test(cell.trim()));
}

function looksLikeRow(line: string): boolean {
  return line.includes("|");
}

/**
 * One markdown row into cells.
 *
 * A cell cannot contain a bare pipe - the table syntax has no way to express
 * one - so splitting on it is safe, and there is no quoting to get wrong. An
 * escaped \\| is the one exception and becomes a literal.
 */
function splitRow(line: string): string[] {
  const body = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return body
    .split(/(?<!\\)\|/)
    .map((cell) => cell.replace(/\\\|/g, "|").trim());
}

/**
 * The table inside a chat reply.
 *
 * Finds the longest run of consecutive pipe-bearing lines that contains a
 * separator row. The separator is what distinguishes a real table from a
 * sentence with a pipe in it, and taking the longest run means a short example
 * table earlier in the reply does not win over the actual list.
 */
function findMarkdownTable(lines: string[]): string[] | null {
  let best: string[] | null = null;
  let run: string[] = [];

  const consider = () => {
    if (run.some(isSeparator) && run.length >= 2) {
      if (!best || run.length > best.length) best = run;
    }
    run = [];
  };

  for (const line of lines) {
    if (looksLikeRow(line)) run.push(line);
    else consider();
  }
  consider();

  return best;
}

/** Pads or trims a row so every row has one cell per column. */
function square(cells: string[], width: number): string[] {
  const row = cells.slice(0, width);
  while (row.length < width) row.push("");
  return row;
}

/**
 * Reads pasted text into something the importer can take.
 *
 * Returns null when there is nothing table-shaped in it, which is a message
 * for the user rather than an error - pasting the wrong thing is an ordinary
 * mistake.
 */
export function parsePasted(raw: string): Pasted | null {
  const fenced = insideFence(raw);
  const text = (fenced ?? raw).replace(/\r\n?/g, "\n").trim();
  if (text === "") return null;

  const lines = text.split("\n");

  // Markdown first: it is what a model produces unless told otherwise, and it
  // is the only one of the three that can be found inside surrounding prose.
  const table = findMarkdownTable(lines);
  if (table) {
    const rows = table.filter((line) => !isSeparator(line)).map(splitRow);
    const [headers, ...body] = rows;
    if (!headers || headers.length === 0) return null;

    return {
      kind: "table",
      headers,
      rows: body
        .map((row) => square(row, headers.length))
        .filter((row) => row.some((cell) => cell !== ""))
        .slice(0, MAX_ROWS + 1),
    };
  }

  // Tab-separated, which is what copying out of Excel or Sheets gives you.
  // A tab cannot appear inside a cell, so this needs no quoting either.
  if (lines[0]?.includes("\t")) {
    const rows = lines.filter((line) => line.trim() !== "").map((line) => line.split("\t"));
    const [headers, ...body] = rows;
    if (!headers) return null;

    return {
      kind: "table",
      headers: headers.map((cell) => cell.trim()),
      rows: body
        .map((row) => square(row.map((cell) => cell.trim()), headers.length))
        .filter((row) => row.some((cell) => cell !== ""))
        .slice(0, MAX_ROWS + 1),
    };
  }

  // Anything else is treated as CSV and handed to the real parser. A comma is
  // the one separator that CAN appear inside a cell, so this is the one that
  // must not be split by hand.
  if (!text.includes(",")) return null;
  return { kind: "csv", text };
}

/**
 * The prompt to hand a model, built from the same column list the parser
 * validates against, so what it is told to produce cannot drift from what
 * Caulder will accept.
 */
export function aiPrompt(): string {
  return [
    "Give me the results as a markdown table and nothing else.",
    "",
    `Use exactly these column headings: ${TEMPLATE_COLUMNS.join(", ")}.`,
    "",
    "Rules:",
    "- Name is required. Every other column may be left blank.",
    "- Leave a cell empty rather than writing \"N/A\", \"unknown\" or a guess.",
    "- One organisation per row. Do not merge two into one row.",
    "- Phone numbers as digits. A second number goes in Alt Phone.",
    "- Value is a whole number, no currency symbol or separators.",
    "- Do not invent contact details. An empty cell is useful; a wrong",
    "  email address is worse than nothing.",
  ].join("\n");
}
