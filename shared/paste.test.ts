import { describe, expect, it } from "vitest";
import { aiPrompt, parsePasted } from "./paste";
import { TEMPLATE_COLUMNS } from "./import";

/**
 * Reading a list out of whatever it was pasted from.
 *
 * The cases here are the shapes a chat reply actually arrives in, not tidy
 * ones: prose either side of the table, a code fence around it, a stray
 * example table earlier in the answer, and the ragged rows a model produces
 * when it runs out of data for the last column.
 */

const REPLY = `Here are 6 schools in Bengaluru that match what you described:

| Name | Contact Person | Email | Phone | City |
| --- | --- | --- | --- | --- |
| Oakridge International School | Asha Menon | asha@oakridge.edu.in | 9480004094 | Bengaluru |
| TRIO World School |  | admissions@trio.com | 9141924141 | Bengaluru |

Let me know if you would like more, or a different area.`;

describe("a table inside a chat reply", () => {
  it("finds the table and ignores the sentences around it", () => {
    const parsed = parsePasted(REPLY);
    expect(parsed?.kind).toBe("table");
    if (parsed?.kind !== "table") return;

    expect(parsed.headers).toEqual(["Name", "Contact Person", "Email", "Phone", "City"]);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]?.[0]).toBe("Oakridge International School");
    expect(parsed.rows[1]?.[1]).toBe("");
  });

  it("drops the separator row rather than importing it as a lead", () => {
    const parsed = parsePasted(REPLY);
    if (parsed?.kind !== "table") throw new Error("expected a table");
    expect(parsed.rows.some((row) => row[0]?.startsWith("-"))).toBe(false);
  });

  it("reads a table with no outer pipes", () => {
    const parsed = parsePasted("Name | City\n--- | ---\nOakridge | Bengaluru");
    if (parsed?.kind !== "table") throw new Error("expected a table");
    expect(parsed.headers).toEqual(["Name", "City"]);
    expect(parsed.rows).toEqual([["Oakridge", "Bengaluru"]]);
  });

  it("takes the real list over a small example earlier in the answer", () => {
    const reply = `The format looks like this:

| Name | City |
| --- | --- |
| Example | Somewhere |

And here is your list:

| Name | City |
| --- | --- |
| Oakridge | Bengaluru |
| TRIO | Bengaluru |
| GIG | Mysuru |`;

    const parsed = parsePasted(reply);
    if (parsed?.kind !== "table") throw new Error("expected a table");
    expect(parsed.rows).toHaveLength(3);
    expect(parsed.rows[0]?.[0]).toBe("Oakridge");
  });

  it("squares up a row the model left short", () => {
    const parsed = parsePasted("| Name | Email | City |\n| - | - | - |\n| Oakridge | a@b.com |");
    if (parsed?.kind !== "table") throw new Error("expected a table");
    expect(parsed.rows[0]).toEqual(["Oakridge", "a@b.com", ""]);
  });

  it("keeps a pipe that was escaped inside a cell", () => {
    const parsed = parsePasted("| Name |\n| --- |\n| Oakridge \\| Prajna listing |");
    if (parsed?.kind !== "table") throw new Error("expected a table");
    expect(parsed.rows[0]?.[0]).toBe("Oakridge | Prajna listing");
  });
});

describe("a fenced block", () => {
  it("uses only what is inside the fence", () => {
    const reply = "Sure, here it is:\n\n```csv\nName,City\nOakridge,Bengaluru\n```\n\nAnything else?";
    const parsed = parsePasted(reply);

    // Handed on as CSV text: a comma is the one separator that can appear
    // inside a cell, so it goes to the real parser rather than being split.
    expect(parsed).toEqual({ kind: "csv", text: "Name,City\nOakridge,Bengaluru" });
  });

  it("reads a fenced markdown table as a table", () => {
    const parsed = parsePasted("```\n| Name |\n| --- |\n| Oakridge |\n```");
    expect(parsed?.kind).toBe("table");
  });
});

describe("rows copied out of a spreadsheet", () => {
  it("reads tab-separated text", () => {
    const parsed = parsePasted("Name\tCity\nOakridge\tBengaluru\nTRIO\tBengaluru");
    if (parsed?.kind !== "table") throw new Error("expected a table");
    expect(parsed.headers).toEqual(["Name", "City"]);
    expect(parsed.rows).toEqual([
      ["Oakridge", "Bengaluru"],
      ["TRIO", "Bengaluru"],
    ]);
  });

  it("keeps an empty trailing cell rather than dropping the column", () => {
    const parsed = parsePasted("Name\tCity\nOakridge\t");
    if (parsed?.kind !== "table") throw new Error("expected a table");
    expect(parsed.rows).toEqual([["Oakridge", ""]]);
  });
});

describe("what is not a list", () => {
  it("refuses empty text", () => {
    expect(parsePasted("")).toBeNull();
    expect(parsePasted("   \n  ")).toBeNull();
  });

  it("refuses prose with no table in it", () => {
    expect(parsePasted("I could not find any schools matching that.")).toBeNull();
  });

  it("does not mistake a sentence containing a pipe for a table", () => {
    // No separator row, so it is not a table however many pipes it has.
    expect(parsePasted("Use a | to separate them")).toBeNull();
  });

  it("drops rows that are entirely empty", () => {
    const parsed = parsePasted("| Name | City |\n| - | - |\n|  |  |\n| Oakridge | Bengaluru |");
    if (parsed?.kind !== "table") throw new Error("expected a table");
    expect(parsed.rows).toEqual([["Oakridge", "Bengaluru"]]);
  });
});

describe("the prompt handed to a model", () => {
  it("names every column the importer offers", () => {
    const prompt = aiPrompt();
    for (const column of TEMPLATE_COLUMNS) {
      expect(prompt, `${column} is missing from the prompt`).toContain(column);
    }
  });

  it("asks for the format this parser is best at", () => {
    expect(aiPrompt()).toContain("markdown table");
  });

  it("round-trips: a reply in the shape it asks for reads back cleanly", () => {
    // The prompt says markdown with exactly these headings, so a model that
    // follows it produces something this parser maps without a single click.
    const headers = `| ${TEMPLATE_COLUMNS.join(" | ")} |`;
    const rule = `| ${TEMPLATE_COLUMNS.map(() => "---").join(" | ")} |`;
    const row = `| ${TEMPLATE_COLUMNS.map((c) => (c === "Name" ? "Oakridge" : "")).join(" | ")} |`;

    const parsed = parsePasted([headers, rule, row].join("\n"));
    if (parsed?.kind !== "table") throw new Error("expected a table");

    expect(parsed.headers).toEqual([...TEMPLATE_COLUMNS]);
    expect(parsed.rows[0]?.[0]).toBe("Oakridge");
  });
});
