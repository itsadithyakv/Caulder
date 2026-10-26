// Fetches the model Caulder understands lines with (PLAN.md, part five):
// all-MiniLM-L6-v2, quantised to int8, from Hugging Face, into resources/model.
//
// Not kept in git - 23 MB that never changes has no business in every clone -
// so it is fetched once, by this, from a pinned revision, and each file is
// checked against the SHA-256 written here. A file that does not match is
// deleted and the script fails: a model that is not the one tested is worse
// than none, because it gives answers.
//
//   npm run fetch-model            fetch what is missing, check what is there
//   npm run fetch-model -- --hash  print the hashes of what is there (to pin a new revision)

import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = "Xenova/all-MiniLM-L6-v2";
const REVISION = "751bff37182d3f1213fa05d7196b954e230abad9";
const FILES = [
  { from: "onnx/model_quantized.onnx", to: "model.onnx", sha256: "afdb6f1a0e45b715d0bb9b11772f032c399babd23bfc31fed1c170afc848bdb1" },
  { from: "vocab.txt", to: "vocab.txt", sha256: "07eced375cec144d27c900241f3e339478dec958f92fddbc551f295c992038a3" },
];

const here = dirname(fileURLToPath(import.meta.url));
const folder = join(here, "..", "resources", "model");
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");

if (process.argv.includes("--hash")) {
  for (const file of FILES) {
    const path = join(folder, file.to);
    console.log(`${file.to}  ${existsSync(path) ? sha(readFileSync(path)) : "(missing)"}`);
  }
  process.exit(0);
}

mkdirSync(folder, { recursive: true });
let failed = false;
for (const file of FILES) {
  const path = join(folder, file.to);
  if (existsSync(path) && sha(readFileSync(path)) === file.sha256) {
    console.log(`${file.to}: already here, and the one pinned.`);
    continue;
  }
  const url = `https://huggingface.co/${REPO}/resolve/${REVISION}/${file.from}`;
  console.log(`${file.to}: fetching ${url}`);
  const response = await globalThis.fetch(url);
  if (!response.ok) {
    console.error(`${file.to}: ${response.status} ${response.statusText}`);
    failed = true;
    continue;
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  const got = sha(bytes);
  if (got !== file.sha256) {
    rmSync(path, { force: true });
    console.error(`${file.to}: SHA-256 ${got} is not the pinned ${file.sha256}. Not kept.`);
    failed = true;
    continue;
  }
  writeFileSync(path, bytes);
  console.log(`${file.to}: ${(bytes.length / 1024 / 1024).toFixed(1)} MB, checked.`);
}
process.exit(failed ? 1 : 0);
