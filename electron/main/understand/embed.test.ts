import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fromBytes, similarity } from "@shared/understand";
import { loadReader, modelFiles, type Reader } from "./embed";

/**
 * The real model, read with in plain Node. Skipped until `npm run
 * fetch-model` has put it in resources/model: the rest of the suite needs
 * nothing fetched.
 *
 * What it checks is what phase 19 promised: that the vectors mean something
 * (a line is nearer one that means the same than one that does not, in
 * English and in the Hinglish the line turns round first), and that reading
 * is quick enough to do after a pause in typing.
 */

const FOLDER = join(process.cwd(), "resources", "model");
const here = existsSync(modelFiles(FOLDER).model) && existsSync(modelFiles(FOLDER).vocab);

describe.skipIf(!here)("the model on this machine", () => {
  let reader: Reader;
  beforeAll(async () => {
    reader = await loadReader(FOLDER);
  });
  afterAll(async () => {
    await reader?.release();
  });

  const alike = async (a: string, b: string) => {
    const [x, y] = await reader.read([a, b]);
    return similarity(fromBytes(x!), fromBytes(y!));
  };

  it("reads a line as 384 bytes, the same line the same way each time", async () => {
    const [one, again] = await reader.read(["call rahul about the demo", "call rahul about the demo"]);
    expect(one).toHaveLength(384);
    expect(similarity(fromBytes(one!), fromBytes(again!))).toBeGreaterThan(0.99);
  });

  it("puts lines that mean the same nearer than lines that do not", async () => {
    // A memory said again in other words.
    expect(await alike("my blood type is O positive", "Blood group: O+")).toBeGreaterThan(
      await alike("my blood type is O positive", "Buy groceries for the week"),
    );
    // A book note and the page it belongs on.
    expect(await alike("red rising book 2 was brutal", "Red Rising")).toBeGreaterThan(await alike("red rising book 2 was brutal", "Gym"));
    // Twelve lines about coffee are about coffee.
    expect(await alike("ethiopian beans are fruity", "a pour over at 93 degrees")).toBeGreaterThan(
      await alike("ethiopian beans are fruity", "send the invoice to oakridge"),
    );
  });

  it("reads a batch after a pause in typing within the budget", async () => {
    await reader.read(["warm up"]);
    const started = performance.now();
    await reader.read(["did 45 min guitar"]);
    const one = performance.now() - started;
    const lines = Array.from({ length: 32 }, (_each, at) => `line number ${at} about the pilot with oakridge school`);
    const begun = performance.now();
    await reader.read(lines);
    const many = performance.now() - begun;
    // A line in 30 ms (PLAN.md, phase 19); generous here, as test machines are busy.
    expect(one).toBeLessThan(150);
    expect(many / lines.length).toBeLessThan(60);
  });
});
