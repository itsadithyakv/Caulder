import { loadReader, type Reader } from "./embed";

/**
 * The utility process the model runs in (PLAN.md, part five). Main starts it
 * (host.ts) and asks it to read lines; it answers with their vectors. Kept out
 * of main because main runs SQLite synchronously and a batch of reading must
 * never hold up a click, and out of the window because the window may not run
 * native code.
 *
 * Messages in: { id, op: "load", folder } and { id, op: "read", lines }.
 * Messages out: { id, ok: true, vectors? } or { id, ok: false, error }.
 */

type Asked = { id: number; op: "load"; folder: string } | { id: number; op: "read"; lines: string[] };

let reader: Reader | null = null;

const port = process.parentPort;

port.on("message", (event: { data: Asked }) => {
  const asked = event.data;
  void (async () => {
    try {
      if (asked.op === "load") {
        reader ??= await loadReader(asked.folder);
        port.postMessage({ id: asked.id, ok: true });
        return;
      }
      if (!reader) throw new Error("The model is not loaded yet.");
      const vectors = await reader.read(asked.lines);
      port.postMessage({ id: asked.id, ok: true, vectors });
    } catch (error) {
      port.postMessage({ id: asked.id, ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  })();
});
