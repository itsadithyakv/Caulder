import { describe, expect, it } from "vitest";
import { TEMPLATE_COLUMNS } from "./import";
import { contactRow, contactSheet, type GooglePerson } from "./gcontacts";

/**
 * Google Contacts as Caulder rows, with the awkward shapes first. Every
 * person here is one the People API really returns.
 */

const principal: GooglePerson = {
  resourceName: "people/c1",
  names: [{ displayName: "Asha Rao", givenName: "Asha", familyName: "Rao" }],
  organizations: [{ name: "TRIO World School", title: "Principal" }],
  emailAddresses: [{ value: "asha@trio.edu" }],
  phoneNumbers: [{ value: "+91 94800 04094" }, { value: "9141924141" }],
  addresses: [{ formattedValue: "Electronic City, Bengaluru 560083", city: "Bengaluru" }],
  urls: [{ value: "https://trio.edu" }],
  biographies: [{ value: "Met at the Prajna Vahini listing." }],
};

describe("a person with a company", () => {
  const row = contactRow(principal);

  // The important one, and the reason this is not the obvious mapping. The
  // lead is the school; Asha is the person to ask for.
  it("makes the company the lead and the human the contact on it", () => {
    expect(row?.Name).toBe("TRIO World School");
    expect(row?.["Contact Person"]).toBe("Asha Rao");
  });

  it("takes the first phone, and keeps the second", () => {
    expect(row?.Phone).toBe("+91 94800 04094");
    expect(row?.["Alt Phone"]).toBe("9141924141");
  });

  it("carries the address both ways round", () => {
    expect(row?.Location).toBe("Electronic City, Bengaluru 560083");
    expect(row?.City).toBe("Bengaluru");
  });

  it("says where it came from, so the batch is recognisable later", () => {
    expect(row?.Source).toBe("Google Contacts");
  });

  it("brings the rest across", () => {
    expect(row?.Email).toBe("asha@trio.edu");
    expect(row?.Website).toBe("https://trio.edu");
    expect(row?.Notes).toBe("Met at the Prajna Vahini listing.");
  });
});

describe("a person with no company", () => {
  // Most of a student founder's address book. Inventing an empty company for
  // them would be worse than filing them under their own name.
  it("is their own lead, with nobody named on it", () => {
    const row = contactRow({ names: [{ displayName: "Ravi Kumar" }] });
    expect(row?.Name).toBe("Ravi Kumar");
    expect(row?.["Contact Person"]).toBe("");
  });
});

describe("the shapes Google really returns", () => {
  it("builds a name from the parts when there is no display name", () => {
    const row = contactRow({ names: [{ givenName: "Asha", familyName: "Rao" }] });
    expect(row?.Name).toBe("Asha Rao");
  });

  it("copes with a person who is only a first name", () => {
    expect(contactRow({ names: [{ givenName: "Asha" }] })?.Name).toBe("Asha");
  });

  // Google keeps contacts that are nothing but an email address. `Name` is
  // the one column the importer requires, and there is nothing to put in it.
  it("refuses a person with no name at all", () => {
    expect(contactRow({ emailAddresses: [{ value: "nobody@example.com" }] })).toBeNull();
    expect(contactRow({})).toBeNull();
  });

  it("files a nameless person under their company", () => {
    const row = contactRow({ organizations: [{ name: "Cambridge School" }] });
    expect(row?.Name).toBe("Cambridge School");
    expect(row?.["Contact Person"]).toBe("");
  });

  it("trims what Google did not", () => {
    const row = contactRow({
      names: [{ displayName: "  Asha Rao  " }],
      emailAddresses: [{ value: "  asha@trio.edu " }],
    });
    expect(row?.Name).toBe("Asha Rao");
    expect(row?.Email).toBe("asha@trio.edu");
  });

  it("leaves a missing field empty rather than undefined", () => {
    const row = contactRow({ names: [{ displayName: "Ravi" }] });
    for (const column of TEMPLATE_COLUMNS) {
      expect(typeof row?.[column]).toBe("string");
    }
  });
});

describe("the sheet handed to the importer", () => {
  const sheet = contactSheet([principal, { emailAddresses: [{ value: "x@y.z" }] }, { names: [{ displayName: "Ravi" }] }]);

  // The whole point of using Caulder's own column names: guessMapping matches
  // every one of them, so the mapping step has nothing to correct.
  it("is headed with Caulder's own columns, in order", () => {
    expect(sheet.headers).toEqual([...TEMPLATE_COLUMNS]);
  });

  it("has a cell for every column on every row", () => {
    for (const row of sheet.rows) expect(row).toHaveLength(TEMPLATE_COLUMNS.length);
  });

  it("leaves out the nameless, and counts them", () => {
    expect(sheet.rows).toHaveLength(2);
    expect(sheet.skipped).toBe(1);
  });

  it("puts the values under their own headings", () => {
    const name = sheet.headers.indexOf("Name");
    const person = sheet.headers.indexOf("Contact Person");
    expect(sheet.rows[0]?.[name]).toBe("TRIO World School");
    expect(sheet.rows[0]?.[person]).toBe("Asha Rao");
    expect(sheet.rows[1]?.[name]).toBe("Ravi");
  });

  it("says nothing was skipped when nothing was", () => {
    expect(contactSheet([principal]).skipped).toBe(0);
    expect(contactSheet([]).rows).toEqual([]);
  });
});
