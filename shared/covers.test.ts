import { describe, expect, it } from "vitest";
import { coverImageUrl, coverSearchUrl, pickCover } from "./covers";

describe("what is sent to Open Library", () => {
  it("is the title, and the series when that tells one book from another - and nothing else", () => {
    const url = new URL(coverSearchUrl("The Lightning Thief", "Percy Jackson"));
    expect(url.origin + url.pathname).toBe("https://openlibrary.org/search.json");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      title: "The Lightning Thief",
      q: "Percy Jackson",
      limit: "5",
      fields: "title,cover_i,edition_count",
    });
  });

  it("does not say the series twice when the title already does", () => {
    expect(new URL(coverSearchUrl("Harry Potter and the Goblet of Fire", "Harry Potter")).searchParams.has("q")).toBe(false);
    expect(new URL(coverSearchUrl("Dune", null)).searchParams.has("q")).toBe(false);
  });

  it("asks for the medium picture", () => {
    expect(coverImageUrl(7239831)).toBe("https://covers.openlibrary.org/b/id/7239831-M.jpg");
  });
});

describe("which answer to believe", () => {
  // As Open Library really answers, trimmed.
  const dune = {
    docs: [
      { cover_i: 980253, edition_count: 201, title: "Dune Messiah" },
      { cover_i: 11481354, edition_count: 161, title: "Dune" },
      { cover_i: 5, edition_count: 3, title: "Dune: a study guide" },
    ],
  };

  it("takes the book asked about, not one that starts the same", () => {
    expect(pickCover(dune, "Dune")).toBe(11481354);
    expect(pickCover(dune, "dune messiah")).toBe(980253);
  });

  it("takes the most-published of several with the title, which is the book rather than a summary of it", () => {
    const thief = {
      docs: [
        { cover_i: 13027680, edition_count: 17, title: "The lightning thief" },
        { cover_i: 7239831, edition_count: 108, title: "The Lightning Thief" },
        { cover_i: 6304834, edition_count: 15, title: "The Lightning Thief / The Sea of Monsters" },
      ],
    };
    expect(pickCover(thief, "The Lightning Thief")).toBe(7239831);
  });

  it("accepts an edition's longer title only when nothing has the title itself", () => {
    expect(pickCover({ docs: [{ cover_i: 9, edition_count: 4, title: "Sapiens: A Brief History of Humankind" }] }, "Sapiens")).toBe(9);
  });

  it("would rather have no cover than the wrong one", () => {
    expect(pickCover({ docs: [{ cover_i: 1, edition_count: 50, title: "Something Else" }] }, "Dune")).toBeNull();
    expect(pickCover({ docs: [{ edition_count: 50, title: "Dune" }] }, "Dune")).toBeNull();
    expect(pickCover(null, "Dune")).toBeNull();
    expect(pickCover({ docs: "no" }, "Dune")).toBeNull();
  });
});
