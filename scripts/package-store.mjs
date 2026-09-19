// Builds the Microsoft Store package: npm run package:store.
//
// electron-builder packs an .appx with makeappx and makepri. The copies in its
// own download (winCodeSign 2.6.0) no longer start on current Windows 11 -
// "side-by-side configuration is incorrect" - so this points it at the newest
// Windows SDK installed here instead, through ELECTRON_BUILDER_WINDOWS_KITS_PATH.
// The SDK is free: https://developer.microsoft.com/windows/downloads/windows-sdk/
//
// The package is unsigned on purpose. The Store signs it once it passes
// certification; the identity it is built with is in electron-builder.yml.
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const bins = join(process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)", "Windows Kits", "10", "bin");

function newestKit() {
  if (process.env["ELECTRON_BUILDER_WINDOWS_KITS_PATH"]) return process.env["ELECTRON_BUILDER_WINDOWS_KITS_PATH"];
  if (!existsSync(bins)) return null;
  const versions = readdirSync(bins)
    .filter((name) => /^10\.\d+\.\d+\.\d+$/.test(name))
    .sort((a, b) => {
      const x = a.split(".").map(Number);
      const y = b.split(".").map(Number);
      for (let i = 0; i < 4; i += 1) if (x[i] !== y[i]) return y[i] - x[i];
      return 0;
    });
  const found = versions.map((version) => join(bins, version, "x64")).find((dir) => existsSync(join(dir, "makeappx.exe")));
  return found ?? null;
}

const kit = newestKit();
if (!kit) {
  console.error(
    "No Windows SDK with makeappx.exe was found under " + bins + ".\n" +
      "Install the Windows SDK (free), or set ELECTRON_BUILDER_WINDOWS_KITS_PATH to a folder holding makeappx.exe and makepri.exe.",
  );
  process.exit(1);
}
console.log(`Windows SDK tools: ${kit}`);

// Through the shell, as npm and npx are .cmd files on Windows; the lines are fixed, not built from input.
const run = (line) => {
  const result = spawnSync(line, {
    stdio: "inherit",
    shell: true,
    env: { ...process.env, ELECTRON_BUILDER_WINDOWS_KITS_PATH: kit },
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

run("npm run build");
run("npx electron-builder --win appx --publish never");
