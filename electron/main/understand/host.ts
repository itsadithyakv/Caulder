import { app, utilityProcess, type UtilityProcess } from "electron";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { logProblem } from "../log";
import { modelFiles } from "./embed";

/**
 * Main's side of the model (PLAN.md, part five): the utility process it runs
 * in, started when first wanted, asked to read lines, and started again if it
 * falls over - a few times, then left down until Caulder starts again.
 *
 * Nothing waits on it. Every caller has a way on without it: the line reads by
 * its rules, the queue waits. So a model that is missing, or a process that
 * will not start, costs understanding and nothing else.
 */

/** Where `npm run fetch-model` puts it, and where the installer puts it beside the executable. */
function modelFolder(): string {
  return app.isPackaged ? join(process.resourcesPath, "model") : join(app.getAppPath(), "resources", "model");
}

export function modelHere(): boolean {
  const files = modelFiles(modelFolder());
  return existsSync(files.model) && existsSync(files.vocab);
}

/** Long enough for a batch on a busy machine, short enough that a hung process is noticed. */
const TIMEOUT_MS = 20_000;
/** Starts again after falling over this many times, then stays down. */
const MOST_STARTS = 3;

type Pending = { resolve: (vectors: Int8Array[]) => void; reject: (error: Error) => void; timer: NodeJS.Timeout };

let child: UtilityProcess | null = null;
let ready: Promise<void> | null = null;
let starts = 0;
let next = 1;
const pending = new Map<number, Pending>();

function send(op: "load" | "read", payload: Record<string, unknown>): Promise<Int8Array[]> {
  const process = child;
  if (!process) return Promise.reject(new Error("The model is not running."));
  const id = next++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error("The model took too long to answer."));
    }, TIMEOUT_MS);
    pending.set(id, { resolve, reject, timer });
    process.postMessage({ id, op, ...payload });
  });
}

function start(): Promise<void> {
  if (ready) return ready;
  if (starts >= MOST_STARTS) return Promise.reject(new Error("The model stopped too often, and is left off until Caulder starts again."));
  if (!modelHere()) return Promise.reject(new Error("The model is not on this computer."));
  starts += 1;
  const spawned = utilityProcess.fork(join(__dirname, "understand.js"), [], { serviceName: "Caulder understanding" });
  child = spawned;
  spawned.on("message", (message: { id: number; ok: boolean; vectors?: Int8Array[]; error?: string }) => {
    const waiting = pending.get(message.id);
    if (!waiting) return;
    pending.delete(message.id);
    clearTimeout(waiting.timer);
    if (message.ok) waiting.resolve(message.vectors ?? []);
    else waiting.reject(new Error(message.error ?? "The model could not read that."));
  });
  spawned.on("exit", (code) => {
    if (child === spawned) {
      child = null;
      ready = null;
    }
    for (const [id, waiting] of pending) {
      clearTimeout(waiting.timer);
      waiting.reject(new Error("The model stopped."));
      pending.delete(id);
    }
    if (code !== 0) logProblem("understanding", new Error(`The model's process stopped (exit ${code}).`));
  });
  ready = send("load", { folder: modelFolder() }).then(
    () => undefined,
    (error: unknown) => {
      stopModel();
      throw error;
    },
  );
  return ready;
}

/** Each line's vector, in order; rejected with a sentence when the model cannot. */
export async function readLines(lines: readonly string[]): Promise<Int8Array[]> {
  if (lines.length === 0) return [];
  await start();
  return send("read", { lines: [...lines] });
}

export function stopModel(): void {
  const process = child;
  child = null;
  ready = null;
  process?.kill();
}

