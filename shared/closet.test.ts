import { describe, expect, it } from "vitest";
import { DEFAULT_OUTFIT, GARMENTS, herPick, pieceOf, tidy, wear, type Garment } from "./closet";

const all = () => true;
const only = (...have: Garment[]) => (garment: Garment) => have.includes(garment);

describe("her closet", () => {
  it("has every piece once, each in one slot", () => {
    const ids = GARMENTS.map((piece) => piece.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(pieceOf("scarf").slot).toBe("neck");
    expect(pieceOf("sneakers").slot).toBe("feet");
  });

  it("dresses her in a scarf and sneakers by default, so she is never bare", () => {
    expect(DEFAULT_OUTFIT).toEqual({ neck: "scarf", feet: "sneakers" });
  });
});

describe("her own pick", () => {
  it("is the same all day and not the same every day", () => {
    expect(herPick("2026-09-24", all)).toEqual(herPick("2026-09-24", all));
    const week = Array.from({ length: 30 }, (_, n) => JSON.stringify(herPick(`2026-09-${String(n + 1).padStart(2, "0")}`, all)));
    expect(new Set(week).size).toBeGreaterThan(3);
  });

  it("is never bare, and adds at most one thing to her neck and her feet", () => {
    for (let n = 1; n <= 28; n += 1) {
      const pick = herPick(`2026-02-${String(n).padStart(2, "0")}`, all);
      expect(pick.neck && pieceOf(pick.neck).slot).toBe("neck");
      expect(pick.feet && pieceOf(pick.feet).slot).toBe("feet");
      expect(Object.keys(pick).length).toBeLessThanOrEqual(3);
    }
  });

  it("changes what is at her neck and on her feet from day to day, when she has more than one", () => {
    const month = Array.from({ length: 30 }, (_, n) => herPick(`2026-04-${String(n + 1).padStart(2, "0")}`, all));
    expect(new Set(month.map((pick) => pick.neck)).size).toBeGreaterThan(2);
    expect(new Set(month.map((pick) => pick.feet)).size).toBeGreaterThan(2);
    // The scarf and sneakers are still hers most often.
    expect(month.filter((pick) => pick.neck === "scarf").length).toBeGreaterThan(8);
  });

  it("keeps the scarf and sneakers while they are all she has", () => {
    for (let n = 1; n <= 28; n += 1) {
      const pick = herPick(`2026-05-${String(n).padStart(2, "0")}`, only("scarf", "sneakers"));
      expect(pick).toEqual({ neck: "scarf", feet: "sneakers" });
    }
  });

  it("only picks what she has", () => {
    for (let n = 1; n <= 28; n += 1) {
      const pick = herPick(`2026-03-${String(n).padStart(2, "0")}`, only("scarf", "sneakers", "beanie"));
      if (pick.head) expect(pick.head).toBe("beanie");
      expect(pick.face).toBeUndefined();
    }
  });
});

describe("dressing her", () => {
  it("puts a thing on in its slot, swapping out what was there", () => {
    expect(wear({ head: "beanie" }, "partyhat")).toEqual({ head: "partyhat" });
  });

  it("takes a thing off if she is already wearing it", () => {
    expect(wear({ head: "beanie", neck: "scarf" }, "beanie")).toEqual({ neck: "scarf" });
  });

  it("never keeps something she has not got", () => {
    expect(tidy({ head: "crown", neck: "scarf" }, only("scarf"))).toEqual({ neck: "scarf" });
  });
});
