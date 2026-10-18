import { describe, expect, it } from "vitest";
import { cleanProfile, messageLink, profileLink, profileShown } from "./profiles";

/**
 * What is typed for a profile is whatever was to hand. One address is kept,
 * and main opens only what these make - so what is worth checking is that
 * nothing typed here can become an address on another site.
 */

describe("a LinkedIn profile", () => {
  it("keeps one address, whatever was pasted", () => {
    const kept = "https://www.linkedin.com/in/priya-nair-12a";
    expect(cleanProfile("linkedin", "https://www.linkedin.com/in/priya-nair-12a/")).toBe(kept);
    expect(cleanProfile("linkedin", "linkedin.com/in/priya-nair-12a")).toBe(kept);
    expect(cleanProfile("linkedin", "  https://in.linkedin.com/in/priya-nair-12a?utm_source=share&trk=x ")).toBe(kept);
    expect(cleanProfile("linkedin", "in/priya-nair-12a")).toBe(kept);
    expect(cleanProfile("linkedin", "priya-nair-12a")).toBe(kept);
  });

  it("knows a company's page from a person's", () => {
    expect(cleanProfile("linkedin", "linkedin.com/company/northwind-studio/about/")).toBe(
      "https://www.linkedin.com/company/northwind-studio",
    );
    expect(cleanProfile("linkedin", "school/reva-university")).toBe("https://www.linkedin.com/school/reva-university");
  });

  it("is nothing when nothing is typed", () => {
    expect(cleanProfile("linkedin", "")).toBeNull();
    expect(cleanProfile("linkedin", "   ")).toBeNull();
    expect(cleanProfile("linkedin", null)).toBeNull();
  });

  it("refuses what is not a profile, in a sentence", () => {
    expect(() => cleanProfile("linkedin", "https://www.linkedin.com/feed/update/urn:li:activity:1")).toThrow(/LinkedIn profile/);
    expect(() => cleanProfile("linkedin", "priya nair")).toThrow(/LinkedIn profile/);
    expect(() => cleanProfile("linkedin", "https://www.linkedin.com/")).toThrow(/LinkedIn profile/);
  });

  it("never becomes an address somewhere else", () => {
    expect(() => cleanProfile("linkedin", "https://evil.example/linkedin.com/in/priya")).toThrow();
    expect(() => cleanProfile("linkedin", "https://linkedin.com.evil.example/in/priya")).toThrow();
    expect(() => cleanProfile("linkedin", "javascript:alert(1)//linkedin.com/in/priya")).toThrow();
    expect(profileLink("linkedin", "https://notlinkedin.com/in/priya")).toBeNull();
  });

  it("is shown short, and read back as written", () => {
    expect(profileShown("linkedin", "https://www.linkedin.com/in/priya-nair-12a")).toBe("in/priya-nair-12a");
    expect(profileShown("linkedin", "https://www.linkedin.com/in/jos%C3%A9-garc%C3%ADa")).toBe("in/josé-garcía");
    expect(profileShown("linkedin", null)).toBeNull();
  });

  it("is messaged from the profile itself", () => {
    expect(messageLink("linkedin", "https://www.linkedin.com/in/priya-nair-12a")).toBe(
      "https://www.linkedin.com/in/priya-nair-12a",
    );
  });
});

describe("an Instagram handle", () => {
  it("keeps one address, whatever was typed", () => {
    const kept = "https://www.instagram.com/priya.nair_";
    expect(cleanProfile("instagram", "@priya.nair_")).toBe(kept);
    expect(cleanProfile("instagram", "priya.nair_")).toBe(kept);
    expect(cleanProfile("instagram", "https://www.instagram.com/priya.nair_/?igshid=abc")).toBe(kept);
    expect(cleanProfile("instagram", "instagram.com/priya.nair_")).toBe(kept);
    expect(cleanProfile("instagram", "ig.me/m/priya.nair_")).toBe(kept);
  });

  it("refuses a post, a sentence, and another site", () => {
    expect(() => cleanProfile("instagram", "https://www.instagram.com/p/Cabc123/")).toThrow(/Instagram handle/);
    expect(() => cleanProfile("instagram", "priya nair")).toThrow(/Instagram handle/);
    expect(() => cleanProfile("instagram", "https://instagram.com.evil.example/priya")).toThrow();
    expect(() => cleanProfile("instagram", "a".repeat(31))).toThrow();
  });

  it("is shown with its @, and messaged in a conversation", () => {
    expect(profileShown("instagram", "https://www.instagram.com/priya.nair_")).toBe("@priya.nair_");
    expect(messageLink("instagram", "https://www.instagram.com/priya.nair_")).toBe("https://ig.me/m/priya.nair_");
    expect(messageLink("instagram", null)).toBeNull();
  });
});
