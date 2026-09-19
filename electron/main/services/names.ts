/**
 * Names for the folders an export writes: safe on Windows, and dated so a
 * second export never lands on top of the first.
 */

/** Windows rejects these in a folder name, and a failed export is a bad answer. */
export function safeName(value: string): string {
  return value.replace(/[<>:"/\\|?*]+/g, "-").trim() || "Caulder";
}

export function stamp(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
    ` ${pad(now.getHours())}${pad(now.getMinutes())}`
  );
}
