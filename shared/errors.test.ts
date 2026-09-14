import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ipcMessage, readableError } from "./errors";

/**
 * Both halves of getting an error across the bridge in one piece. The wrapped
 * strings are what Electron 38 actually builds: `Error invoking remote method
 * '<channel>': ` followed by the thrown value's own `toString()`.
 */

describe("ipcMessage", () => {
  it("takes Electron's wrapper and the error's name off a plain Error", () => {
    expect(
      ipcMessage(`Error invoking remote method 'words:add': Error: "CS301" is already a word for College.`),
    ).toBe(`"CS301" is already a word for College.`);
  });

  it("takes off any error name, not only Error's", () => {
    expect(
      ipcMessage("Error invoking remote method 'leads:create': SqliteError: FOREIGN KEY constraint failed"),
    ).toBe("FOREIGN KEY constraint failed");
  });

  it("keeps a message that runs over several lines whole", () => {
    // The regex this replaced stopped at the first line end.
    expect(ipcMessage("Error invoking remote method 'x': Error: one\ntwo")).toBe("one\ntwo");
  });

  it("keeps a colon inside the sentence", () => {
    expect(ipcMessage("Error invoking remote method 'x': Error: Missing: the company id.")).toBe(
      "Missing: the company id.",
    );
  });

  it("copes with a thrown value that was not an Error", () => {
    // `throw "text"` reaches the wrapper as the bare string.
    expect(ipcMessage("Error invoking remote method 'x': text")).toBe("text");
  });

  it("leaves a message that never crossed the bridge exactly as it was", () => {
    expect(ipcMessage("TypeError: x is undefined")).toBe("TypeError: x is undefined");
    expect(ipcMessage("Say what needs doing.")).toBe("Say what needs doing.");
  });

  it("changes nothing the second time", () => {
    const once = ipcMessage("Error invoking remote method 'x': Error: Pick a date.");
    expect(ipcMessage(once)).toBe(once);
  });
});

describe("readableError", () => {
  const schema = z.object({
    title: z.string().trim().min(1, "Say what the task is.").max(5, "Keep the title short."),
  });

  it("turns a ZodError into the schema's own first sentence", () => {
    const result = schema.safeParse({ title: "far too long a title" });
    expect(result.success).toBe(false);
    const readable = readableError(result.error);
    expect(readable).toBeInstanceOf(Error);
    expect((readable as Error).message).toBe("Keep the title short.");
  });

  it("is what makes the difference - the ZodError's own message is JSON", () => {
    const result = schema.safeParse({ title: "" });
    expect(result.error?.message.trimStart().startsWith("[")).toBe(true);
    expect((readableError(result.error) as Error).message).toBe("Say what the task is.");
  });

  it("passes every other error through as the same object", () => {
    const plain = new Error("Pick a date.");
    expect(readableError(plain)).toBe(plain);
    expect(readableError("text")).toBe("text");
  });
});
