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

  it("always keeps the scarf and sneakers, and adds at most one thing", () => {
    for (let n = 1; n <= 28; n += 1) {
      const pick = herPick(`2026-02-${String(n).padStart(2, "0")}`, all);
      expect(pick.neck).toBe("scarf");
      expect(pick.feet).toBe("sneakers");
      expect(Object.keys(pick).length).toBeLessThanOrEqual(3);
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
