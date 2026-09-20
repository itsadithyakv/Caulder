import { beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { migrate } from "../db/migrations";
import { createCompany } from "../repositories/companies";
import { readBook } from "@shared/books";

/**
 * Book covers, with Open Library stood in for: what matters is what is asked,
 * when, and what is kept - and that with covers off, nothing is asked at all.
 */

const asked: string[] = [];
let answer: (url: string) => Response | Promise<Response>;

vi.mock("electron", () => ({
  net: {
    fetch: (url: string) => {
      asked.push(url);
      return Promise.resolve(answer(url));
    },
  },
}));

const { coversOn, fillCovers, forgetCovers, setCovers } = await import("./covers");
const { shelfAdd } = await import("./tracker");

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const found = (title: string, id: number) => new Response(JSON.stringify({ docs: [{ title, cover_i: id, edition_count: 9 }] }));
const picture = () => new Response(JPEG, { headers: { "content-type": "image/jpeg" } });

let db: Database.Database;
let companyId: string;

beforeEach(() => {
  asked.length = 0;
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  companyId = createCompany(db, { name: "Mine", accent: "coffee", timezone: "Asia/Kolkata", kind: "personal" }).id;
  shelfAdd(db, companyId, readBook("i am reading dune"));
  answer = (url) => (url.includes("search.json") ? found("Dune", 42) : picture());
});

describe("off, which is how it starts", () => {
  it("asks nobody anything", async () => {
    expect(coversOn(db)).toBe(false);
    const { shelf, error } = await fillCovers(db, companyId);
    expect(asked).toEqual([]);
    expect(error).toBeNull();
    expect(shelf.reading[0]?.cover).toBeNull();
  });
});

describe("on", () => {
  beforeEach(() => {
    setCovers(db, true);
  });

  it("sends the title, keeps the picture itself, and does not ask again", async () => {
    const { shelf } = await fillCovers(db, companyId);
    expect(asked).toHaveLength(2);
    expect(asked[0]).toContain("openlibrary.org/search.json?title=Dune");
    expect(asked[1]).toBe("https://covers.openlibrary.org/b/id/42-M.jpg");
    expect(shelf.reading[0]?.cover).toBe(`data:image/jpeg;base64,${JPEG.toString("base64")}`);

    await fillCovers(db, companyId);
    expect(asked).toHaveLength(2);
  });

  it("keeps the drawn cover for a book with none, and asks about it only once", async () => {
    answer = () => new Response(JSON.stringify({ docs: [] }));
    expect((await fillCovers(db, companyId)).shelf.reading[0]?.cover).toBeNull();
    await fillCovers(db, companyId);
    expect(asked).toHaveLength(1);
  });

  it("will not keep what is not a picture", async () => {
    answer = (url) => (url.includes("search.json") ? found("Dune", 42) : new Response("<html>", { headers: { "content-type": "text/html" } }));
    expect((await fillCovers(db, companyId)).shelf.reading[0]?.cover).toBeNull();
  });

  it("says so when Open Library cannot be reached, and leaves the book to be tried again", async () => {
    answer = () => Promise.reject(new Error("net::ERR_INTERNET_DISCONNECTED"));
    const { error, shelf } = await fillCovers(db, companyId);
    expect(error).toContain("Could not reach Open Library");
    expect(shelf.reading[0]?.cover).toBeNull();

    answer = (url) => (url.includes("search.json") ? found("Dune", 42) : picture());
    expect((await fillCovers(db, companyId)).shelf.reading[0]?.cover).toContain("data:image/jpeg");
  });

  it("drops the covers it kept when they are switched off", async () => {
    await fillCovers(db, companyId);
    setCovers(db, false);
    forgetCovers(db);
    expect((await fillCovers(db, companyId)).shelf.reading[0]?.cover).toBeNull();
  });
});
