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
/**
 * Let go of after this long with nothing to read. The model holds a hundred
 * megabytes or so while it is loaded, and a queue is read in bursts - after
 * an import, after an edit - so between them it is let go, and loaded again
 * in a second or two when there is more.
 */
const IDLE_MS = 3 * 60 * 1000;
let idle: NodeJS.Timeout | null = null;

function restIdle(): void {
  if (idle) clearTimeout(idle);
  idle = setTimeout(() => {
    idle = null;
    if (pending.size === 0) stopModel();
  }, IDLE_MS);
}

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

/** Set on the way out: nothing may start the model again once the app is quitting. */
let closed = false;

function start(): Promise<void> {
  if (closed) return Promise.reject(new Error("Caulder is closing."));
  if (ready) return ready;
  if (starts >= MOST_STARTS) return Promise.reject(new Error("The model stopped too often, and is left off until Caulder starts again."));
  if (!modelHere()) return Promise.reject(new Error("The model is not on this computer."));
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
    // Let go of on purpose - idle, switched off, quitting - is not falling over; only that counts against starting again.
    const meant = !child || child !== spawned || letGo.has(spawned);
    letGo.delete(spawned);
    if (!meant) starts += 1;
    if (child === spawned) {
      child = null;
      ready = null;
    }
    for (const [id, waiting] of pending) {
      clearTimeout(waiting.timer);
      waiting.reject(new Error("The model stopped."));
      pending.delete(id);
    }
    if (code !== 0 && !meant) logProblem("understanding", new Error(`The model's process stopped (exit ${code}).`));
  });
  ready = send("load", { folder: modelFolder() }).then(
    () => undefined,
    (error: unknown) => {
      // A model that will not load counts as falling over, or a broken one would be started again for ever.
      starts += 1;
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
  try {
    return await send("read", { lines: [...lines] });
  } finally {
    restIdle();
  }
}

/** Stops it for good: on the way out, so a read still in flight cannot start it again. */
export function closeModel(): void {
  closed = true;
  stopModel();
}

/** The processes let go of on purpose, so their exit is not counted as falling over. */
const letGo = new WeakSet<UtilityProcess>();

export function stopModel(): void {
  const process = child;
  child = null;
  ready = null;
  if (idle) clearTimeout(idle);
  idle = null;
  if (process) letGo.add(process);
  process?.kill();
}

