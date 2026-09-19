/**
 * Two versions of a page, line by line.
 *
 * A longest-common-subsequence diff after trimming what both ends share,
 * which is all a page history needs: pages are short, and the middle that
 * changed is shorter still. Past a size where the table would be expensive it
 * says the whole thing changed rather than making the window wait.
 */

export type DiffLine = { kind: "same" | "added" | "removed"; text: string };

const MAX_CELLS = 4_000_000;

export function diffLines(before: string, after: string): DiffLine[] {
  const a = before.split("\n");
  const b = after.split("\n");

  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start += 1;

  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA -= 1;
    endB -= 1;
  }

  const head = a.slice(0, start).map((text): DiffLine => ({ kind: "same", text }));
  const tail = a.slice(endA).map((text): DiffLine => ({ kind: "same", text }));
  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);

  return [...head, ...middle(midA, midB), ...tail];
}

function middle(a: string[], b: string[]): DiffLine[] {
  if (a.length === 0) return b.map((text) => ({ kind: "added", text }));
  if (b.length === 0) return a.map((text) => ({ kind: "removed", text }));

  if (a.length * b.length > MAX_CELLS) {
    return [
      ...a.map((text): DiffLine => ({ kind: "removed", text })),
      ...b.map((text): DiffLine => ({ kind: "added", text })),
    ];
  }

  // lengths[i][j]: the common subsequence of a[i..] and b[j..].
  const width = b.length + 1;
  const lengths = new Uint32Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      lengths[i * width + j] =
        a[i] === b[j]
          ? (lengths[(i + 1) * width + j + 1] ?? 0) + 1
          : Math.max(lengths[(i + 1) * width + j] ?? 0, lengths[i * width + j + 1] ?? 0);
    }
  }

  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ kind: "same", text: a[i] ?? "" });
      i += 1;
      j += 1;
    } else if ((lengths[(i + 1) * width + j] ?? 0) >= (lengths[i * width + j + 1] ?? 0)) {
      out.push({ kind: "removed", text: a[i] ?? "" });
      i += 1;
    } else {
      out.push({ kind: "added", text: b[j] ?? "" });
      j += 1;
    }
  }
  while (i < a.length) out.push({ kind: "removed", text: a[i++] ?? "" });
  while (j < b.length) out.push({ kind: "added", text: b[j++] ?? "" });
  return out;
}
