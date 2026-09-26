// The licences of everything Caulder ships (PLAN.md, part six, phase 23):
// out/notices/third-party-notices.txt, which the package carries beside the
// executable and About Caulder opens. Run after every build (npm run build).
//
// What ships is two kinds of package:
// - what a build bundled, listed by the build itself in
//   out/notices/bundled-<target>.json (electron.vite.config.ts);
// - the runtime dependencies in package.json, loaded from node_modules, and
//   everything they depend on in turn.
// Electron's and Chromium's own licences are put beside the executable by
// electron-builder (LICENSE.electron.txt, LICENSES.chromium.html).
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const folder = join(root, "out", "notices");
const TARGETS = ["main", "preload", "renderer"];

const missing = TARGETS.filter((target) => !existsSync(join(folder, `bundled-${target}.json`)));
if (missing.length > 0) {
  console.error(`No list of what the ${missing.join(", ")} build bundled. Run npm run build first.`);
  process.exit(1);
}

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

/** Where `name` is found from `from`, the way Node looks: its own node_modules, then each one above. */
function findPackage(name, from) {
  let dir = from;
  for (;;) {
    const candidate = join(dir, "node_modules", name);
    if (existsSync(join(candidate, "package.json"))) return candidate;
    if (dir === root) return null;
    const up = dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

/** Package folders by name@version, so one found twice is written once. */
const found = new Map();

function add(dir) {
  const pkg = readJson(join(dir, "package.json"));
  const key = `${pkg.name}@${pkg.version}`;
  if (found.has(key)) return false;
  found.set(key, { dir, pkg });
  return true;
}

// What the builds bundled.
for (const target of TARGETS) {
  for (const dir of Object.values(readJson(join(folder, `bundled-${target}.json`)))) {
    if (existsSync(join(dir, "package.json"))) add(dir);
  }
}

// The runtime dependencies, and theirs.
const walk = (dir) => {
  const pkg = readJson(join(dir, "package.json"));
  const optional = pkg.optionalDependencies ?? {};
  for (const name of Object.keys({ ...(pkg.dependencies ?? {}), ...optional })) {
    const at = findPackage(name, dir);
    if (!at) {
      if (name in optional) continue;
      console.error(`${pkg.name ?? "Caulder"} depends on ${name}, which is not in node_modules. Run npm install.`);
      process.exit(1);
    }
    if (add(at)) walk(at);
  }
};
walk(root);

const LICENCE = /^(licen[cs]e|copying|notice)([.-].*)?$/i;

function licenceOf({ dir, pkg }) {
  const declared = typeof pkg.license === "string" ? pkg.license : (pkg.license?.type ?? "not stated");
  const files = readdirSync(dir).filter((name) => LICENCE.test(name)).sort();
  const texts = files.map((name) => readFileSync(join(dir, name), "utf8").trim());
  return { declared, text: texts.length > 0 ? texts.join("\n\n") : `No licence file in the package. Its package.json says: ${declared}.` };
}

const rule = "=".repeat(78);
const packages = [...found.values()].sort((a, b) => a.pkg.name.localeCompare(b.pkg.name));
const version = readJson(join(root, "package.json")).version;

const parts = [
  `Caulder ${version} - licences of what it ships`,
  "",
  "Caulder is free. It is built on the work below, each under its own licence.",
  "Electron's and Chromium's licences are beside the executable, in",
  "LICENSE.electron.txt and LICENSES.chromium.html.",
  "",
  rule,
  readFileSync(join(root, "resources", "licences", "model.txt"), "utf8").trim(),
  "",
  readFileSync(join(root, "resources", "licences", "apache-2.0.txt"), "utf8").trim(),
  "",
  rule,
  `The packages (${packages.length})`,
  "",
  ...packages.map((entry) => `- ${entry.pkg.name} ${entry.pkg.version} (${licenceOf(entry).declared})`),
];
for (const entry of packages) {
  parts.push("", rule, `${entry.pkg.name} ${entry.pkg.version}`, "", licenceOf(entry).text);
}

writeFileSync(join(folder, "third-party-notices.txt"), `${parts.join("\n")}\n`);
console.log(`Licences: ${packages.length} packages and the model, in out/notices/third-party-notices.txt.`);
