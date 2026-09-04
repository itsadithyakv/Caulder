import { describe, expect, it } from "vitest";
import {
  clean,
  labelKey,
  normaliseEmail,
  parseValue,
  phoneKey,
  splitLocation,
  splitNameAndSource,
  splitPhones,
  text,
} from "./normalise";
import { guessColumn } from "./import";

/**
 * Every case here is a literal value from D:\MyFiles\LeadsUnifloe.xlsx. The
 * importer is built against the file that exists, not an idealised one.
 */

describe("text", () => {
  it("keeps a number as digits", () => {
    // Row 21 stores its phone as a number while every other row is a string.
    // String(9480040338) must not become an exponent or gain a decimal tail.
    expect(text(9480040338)).toBe("9480040338");
  });

  it("reads an exceljs hyperlink cell", () => {
    // The first eight email cells are hyperlink objects, not strings.
    expect(text({ text: "bpsdkh@gmail.com", hyperlink: "mailto:bpsdkh@gmail.com" })).toBe(
      "bpsdkh@gmail.com",
    );
  });

  it("falls back to the hyperlink when there is no display text", () => {
    expect(text({ hyperlink: "mailto:jes@example.com" })).toBe("jes@example.com");
  });

  it("reads a formula result and rich text", () => {
    expect(text({ formula: "A1", result: "Bengaluru" })).toBe("Bengaluru");
    expect(text({ richText: [{ text: "TRIO " }, { text: "World" }] })).toBe("TRIO World");
  });

  it("trims, and treats nothing as empty", () => {
    expect(text("  Bengaluru  ")).toBe("Bengaluru");
    expect(text(null)).toBe("");
    expect(text(undefined)).toBe("");
  });
});

describe("clean", () => {
  it("turns the sheet's longhand for missing into null", () => {
    expect(clean("Not mentioned")).toBeNull();
    expect(clean("Not clearly mentioned")).toBeNull();
    expect(clean("N/A")).toBeNull();
    expect(clean("  ")).toBeNull();
    expect(clean("-")).toBeNull();
  });

  it("is not fooled by case", () => {
    expect(clean("NOT MENTIONED")).toBeNull();
  });

  it("keeps real values", () => {
    expect(clean("Bengaluru")).toBe("Bengaluru");
    // A school genuinely called "Nil Public School" is not a missing value.
    expect(clean("Nil Public School")).toBe("Nil Public School");
  });
});

describe("splitNameAndSource", () => {
  it("lifts a listing suffix out of the name", () => {
    expect(splitNameAndSource("TRIO World School / Prajna Vahini listing")).toEqual({
      name: "TRIO World School",
      source: "Prajna Vahini listing",
    });
    expect(
      splitNameAndSource("Delhi Public School Electronic City / MVJ International School listing"),
    ).toEqual({
      name: "Delhi Public School Electronic City",
      source: "MVJ International School listing",
    });
  });

  it("leaves an ordinary name alone", () => {
    expect(splitNameAndSource("JES Public School")).toEqual({
      name: "JES Public School",
      source: null,
    });
  });

  it("does not treat every slash as provenance", () => {
    // Only a trailing fragment ending in "listing" is provenance.
    expect(splitNameAndSource("St Mary's / St Joseph's School")).toEqual({
      name: "St Mary's / St Joseph's School",
      source: null,
    });
  });

  it("keeps the name when there would be nothing left", () => {
    expect(splitNameAndSource("Prajna Vahini listing").name).toBe("Prajna Vahini listing");
  });
});

describe("splitPhones", () => {
  it("splits a two-number cell", () => {
    expect(splitPhones("9480004094 / 9141924141")).toEqual({
      phone: "9480004094",
      altPhone: "9141924141",
    });
  });

  it("leaves a single number alone, country code and all", () => {
    expect(splitPhones("+91 9019959088")).toEqual({
      phone: "+91 9019959088",
      altPhone: null,
    });
  });

  it("keeps every extra number rather than dropping any", () => {
    expect(splitPhones("111111111, 222222222, 333333333")).toEqual({
      phone: "111111111",
      altPhone: "222222222, 333333333",
    });
  });

  it("gives nothing back for a cell with no digits", () => {
    expect(splitPhones(null)).toEqual({ phone: null, altPhone: null });
    expect(splitPhones("call the office")).toEqual({ phone: null, altPhone: null });
  });
});

describe("phoneKey", () => {
  it("sees through a country code", () => {
    // These two are the same number and must not become two leads.
    expect(phoneKey("+91 9019959088")).toBe("9019959088");
    expect(phoneKey("9019959088")).toBe("9019959088");
    expect(phoneKey("+91-9019959088")).toBe("9019959088");
  });

  it("ignores something too short to be a number", () => {
    expect(phoneKey("123")).toBeNull();
    expect(phoneKey(null)).toBeNull();
  });
});

describe("normaliseEmail", () => {
  it("lowercases and trims", () => {
    expect(normaliseEmail("  BPSDKH@Gmail.com ")).toBe("bpsdkh@gmail.com");
  });

  it("strips a mailto prefix", () => {
    expect(normaliseEmail("mailto:jespublicschool@gmail.com")).toBe(
      "jespublicschool@gmail.com",
    );
  });

  it("rejects what is not an address", () => {
    expect(normaliseEmail("Not clearly mentioned")).toBeNull();
    expect(normaliseEmail("office at school dot com")).toBeNull();
  });
});

describe("splitLocation", () => {
  it("takes the city and PIN out of a full address", () => {
    expect(
      splitLocation("Doddakammanahalli, Gottigere PO, Bannerghatta Road, Bengaluru – 560083"),
    ).toMatchObject({ city: "Bengaluru", pin: "560083" });
  });

  it("handles the en dash the file uses before every PIN", () => {
    expect(splitLocation("Vishweshwarayya Layout, Bengaluru – 560056")).toMatchObject({
      city: "Bengaluru",
      pin: "560056",
    });
  });

  it("reads a slash as separating two addresses and takes the last", () => {
    expect(splitLocation("Electronic City / Bengaluru")).toMatchObject({
      city: "Bengaluru",
    });
    expect(
      splitLocation("Bengaluru – 560027 / Vishweshwarayya Layout, Bengaluru – 560056"),
    ).toMatchObject({ city: "Bengaluru", pin: "560027" });
  });

  it("copes with a bare city", () => {
    expect(splitLocation("Bengaluru")).toMatchObject({ city: "Bengaluru", pin: null });
  });

  it("keeps the address it was given, whatever it made of it", () => {
    // The user can still read the original even when the city guess is wrong.
    const result = splitLocation("Vivekananda Puri, Jagtial Road");
    expect(result.location).toBe("Vivekananda Puri, Jagtial Road");
  });

  it("gives nothing back for nothing", () => {
    expect(splitLocation(null)).toEqual({ location: null, city: null, pin: null });
  });
});

describe("parseValue", () => {
  it("reads a number out of a formatted amount", () => {
    expect(parseValue("45,000")).toBe(45000);
    expect(parseValue("₹ 1,20,000")).toBe(120000);
    expect(parseValue("50000")).toBe(50000);
  });

  it("treats an unreadable value as not known rather than zero", () => {
    expect(parseValue("to be discussed")).toBeNull();
    expect(parseValue(null)).toBeNull();
  });
});

describe("labelKey", () => {
  it("folds case and spacing so the same name matches itself", () => {
    expect(labelKey("  Oakridge   International School  ")).toBe(
      "oakridge international school",
    );
    expect(labelKey("OAKRIDGE INTERNATIONAL SCHOOL")).toBe(
      "oakridge international school",
    );
  });

  it("gives nothing back for nothing", () => {
    expect(labelKey(null)).toBeNull();
    expect(labelKey("   ")).toBeNull();
  });
});

describe("guessColumn", () => {
  it("recognises the headers the real file actually uses", () => {
    // None of these match Caulder's own column names, which is why mapping
    // exists at all; guessing them means the common case needs no work.
    expect(guessColumn("School name")).toBe("Name");
    expect(guessColumn("Phone number")).toBe("Phone");
    expect(guessColumn("Email")).toBe("Email");
    expect(guessColumn("Location")).toBe("Location");
  });

  it("ignores case and punctuation", () => {
    expect(guessColumn("  E-Mail Address ")).toBe("Email");
    expect(guessColumn("CONTACT PERSON")).toBe("Contact Person");
  });

  it("prefers the more specific column when both could match", () => {
    // "Alt Phone" must not be swallowed by "Phone".
    expect(guessColumn("Alternate phone")).toBe("Alt Phone");
  });

  it("says nothing rather than guessing wildly", () => {
    expect(guessColumn("Board affiliation")).toBeNull();
    expect(guessColumn("")).toBeNull();
  });
});
