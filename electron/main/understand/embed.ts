import { readFileSync } from "node:fs";
import { join } from "node:path";
import ort from "onnxruntime-node";
import { DIMS, batch, meanPool, normalise, readVocab, toBytes, type Vocab } from "@shared/understand";

/**
 * The model, loaded and asked: lines in, one vector of 384 bytes each out.
 *
 * Only the matrix work is the runtime's. Tokens, pooling and keeping it to a
 * byte a number are shared/understand.ts, so what is tested there is what
 * runs here. This file is plain Node: the utility process wraps it
 * (worker.ts), and the tests load it directly against the real model.
 */

export type Reader = {
  /** Each line's vector, in order. */
  read: (lines: readonly string[]) => Promise<Int8Array[]>;
  release: () => Promise<void>;
};

/** The model's files, in the folder `npm run fetch-model` fills. */
export function modelFiles(folder: string): { model: string; vocab: string } {
  return { model: join(folder, "model.onnx"), vocab: join(folder, "vocab.txt") };
}

/**
 * Loads the model. One thread or two: it reads in the background while the
 * person works, and a line or a batch of thirty-two takes milliseconds either
 * way, so it is kept from competing with the window for the processor.
 */
export async function loadReader(folder: string, threads = 2): Promise<Reader> {
  const files = modelFiles(folder);
  const vocab: Vocab = readVocab(readFileSync(files.vocab, "utf8"));
  const session = await ort.InferenceSession.create(files.model, {
    executionProviders: ["cpu"],
    graphOptimizationLevel: "all",
    intraOpNumThreads: threads,
    interOpNumThreads: 1,
  });

  const read = async (lines: readonly string[]): Promise<Int8Array[]> => {
    if (lines.length === 0) return [];
    const { ids, mask, length } = batch(lines, vocab);
    const shape = [lines.length, length];
    const tensor = (rows: number[][]) => new ort.Tensor("int64", BigInt64Array.from(rows.flat(), (value) => BigInt(value)), shape);
    const output = await session.run({
      input_ids: tensor(ids),
      attention_mask: tensor(mask),
      token_type_ids: tensor(ids.map((row) => row.map(() => 0))),
    });
    const hidden = output["last_hidden_state"]?.data as Float32Array | undefined;
    if (!hidden) throw new Error("The model answered without the vectors it is read for.");
    return lines.map((_line, at) => {
      const rows = hidden.subarray(at * length * DIMS, (at + 1) * length * DIMS);
      return toBytes(normalise(meanPool(rows, mask[at] ?? [], DIMS)));
    });
  };

  return { read, release: () => session.release() };
}
