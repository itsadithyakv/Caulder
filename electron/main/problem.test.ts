import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({ app: { getVersion: () => "0.4.0" }, shell: { openExternal: vi.fn() } }));

const { redact } = await import("./problem");

/**
 * What a problem report takes out before anyone sees it: whatever says who
 * the person is or who their contacts are.
 */
describe("a problem report", () => {
  it("takes out emails, phone numbers and the Windows account name", () => {
    const line =
      "[sync] failed for asha@oakridge.edu.in (+91 90199 59088) reading C:\\Users\\Adi\\AppData\\Roaming\\Caulder\\caulder.db";
    expect(redact(line)).toBe(
      "[sync] failed for [email] ([number]) reading C:\\Users\\[you]\\AppData\\Roaming\\Caulder\\caulder.db",
    );
  });

  it("leaves what makes the line useful: times, counts, and short numbers", () => {
    const line = "2026-09-19T06:00:00.000Z [scheduler] 3 tasks, retry in 15 min";
    expect(redact(line)).toBe(line);
  });
});
