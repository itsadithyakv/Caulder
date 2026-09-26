/**
 * Understanding, on this machine (PLAN.md, part five): everything about it
 * that is arithmetic rather than the model.
 *
 * The model is all-MiniLM-L6-v2, int8, run by onnxruntime-node in a utility
 * process (electron/main/understand/). It turns token ids into a vector per
 * token and nothing else; the rest is here, pure, so it can be tested without
 * the model and cannot drift between the process that embeds and the one that
 * compares:
 *
 *  - **Tokens.** BERT's lower-cased WordPiece, exactly: a wrong split still
 *    gives the model something to embed, and the vectors it returns are then
 *    quietly meaningless. Checked against the ids the real vocabulary gives.
 *  - **One vector a line.** The token vectors averaged over the real tokens
 *    (padding left out) and scaled to length one, the way the model was
 *    trained to be used.
 *  - **Kept small.** A length-one vector has every number in [-1, 1], so it is
 *    kept as one byte a number: 384 bytes a line, compared in a few
 *    milliseconds for a few thousand lines, with no vector database.
 *
 * Nothing here knows what a line is for; deciding what is near what is the
 * reader's (phase 20).
 */

/** How long each line's vector is: MiniLM's hidden size. */
export const DIMS = 384;

/** The most tokens a line is read to. Longer is cut: a quick line is rarely a tenth of this. */
const MAX_TOKENS = 128;

/** The model this build reads with. Kept beside every vector, so a new one reads everything again rather than mixing two. */
export const MODEL = "all-MiniLM-L6-v2-int8";

export type Vocab = ReadonlyMap<string, number>;

/** vocab.txt: one token a line, its id the line number. */
export function readVocab(text: string): Map<string, number> {
  const vocab = new Map<string, number>();
  text.split(/\r?\n/).forEach((token, id) => {
    if (token.length > 0 && !vocab.has(token)) vocab.set(token, id);
  });
  return vocab;
}

/* ---- Tokens -------------------------------------------------------------- */

/** BERT counts every ASCII symbol as punctuation, and Unicode's punctuation too. */
function isPunctuation(char: string): boolean {
  const code = char.codePointAt(0) ?? 0;
  if ((code >= 33 && code <= 47) || (code >= 58 && code <= 64) || (code >= 91 && code <= 96) || (code >= 123 && code <= 126)) return true;
  return /\p{P}/u.test(char);
}

/** Characters that start a word of their own: Han and the rest, one to a word. */
function isIdeograph(code: number): boolean {
  return (
    (code >= 0x4e00 && code <= 0x9fff) ||
    (code >= 0x3400 && code <= 0x4dbf) ||
    (code >= 0x20000 && code <= 0x2a6df) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0x2f800 && code <= 0x2fa1f)
  );
}

/**
 * BERT's basic tokenizer, lower-casing kind: control characters dropped,
 * lower case, accents taken off, then split on white space and around every
 * punctuation mark and ideograph.
 */
export function basicTokens(text: string): string[] {
  const words: string[] = [];
  let current = "";
  const flush = () => {
    if (current) words.push(current);
    current = "";
  };
  const plain = text.toLowerCase().normalize("NFD").replace(/\p{Mn}/gu, "");
  for (const char of plain) {
    const code = char.codePointAt(0) ?? 0;
    if (code === 0 || code === 0xfffd || (/\p{Cc}|\p{Cf}/u.test(char) && !/\s/.test(char))) continue;
    if (/\s/.test(char)) flush();
    else if (isPunctuation(char) || isIdeograph(code)) {
      flush();
      words.push(char);
    } else current += char;
  }
  flush();
  return words;
}

/** WordPiece: the longest piece the vocabulary has, again and again; a word it cannot finish is unknown whole. */
export function wordPieces(word: string, vocab: Vocab): number[] {
  const unknown = vocab.get("[UNK]") ?? 100;
  const chars = [...word];
  if (chars.length > 100) return [unknown];
  const ids: number[] = [];
  let start = 0;
  while (start < chars.length) {
    let end = chars.length;
    let found: number | undefined;
    while (start < end) {
      const piece = (start > 0 ? "##" : "") + chars.slice(start, end).join("");
      found = vocab.get(piece);
      if (found !== undefined) break;
      end -= 1;
    }
    if (found === undefined) return [unknown];
    ids.push(found);
    start = end;
  }
  return ids;
}

type Encoded = { ids: number[]; mask: number[] };

/** A line as the model reads it: [CLS], its pieces, [SEP], cut to the most tokens. */
export function encode(text: string, vocab: Vocab, most = MAX_TOKENS): Encoded {
  const cls = vocab.get("[CLS]") ?? 101;
  const sep = vocab.get("[SEP]") ?? 102;
  const pieces = basicTokens(text).flatMap((word) => wordPieces(word, vocab));
  const ids = [cls, ...pieces.slice(0, Math.max(0, most - 2)), sep];
  return { ids, mask: ids.map(() => 1) };
}

/** Several lines padded to the longest, so they go to the model as one batch. */
export function batch(lines: readonly string[], vocab: Vocab, most = MAX_TOKENS): { ids: number[][]; mask: number[][]; length: number } {
  const encoded = lines.map((line) => encode(line, vocab, most));
  const length = Math.max(0, ...encoded.map((each) => each.ids.length));
  const pad = vocab.get("[PAD]") ?? 0;
  return {
    ids: encoded.map((each) => [...each.ids, ...Array<number>(length - each.ids.length).fill(pad)]),
    mask: encoded.map((each) => [...each.mask, ...Array<number>(length - each.mask.length).fill(0)]),
    length,
  };
}

/* ---- One vector a line ------------------------------------------------------ */

/**
 * The line's vector from the model's output for it: the mean of its tokens'
 * vectors, padding left out. `hidden` is that line's rows, token after token.
 */
export function meanPool(hidden: ArrayLike<number>, mask: readonly number[], dims = DIMS): Float32Array {
  const out = new Float32Array(dims);
  let count = 0;
  mask.forEach((keep, token) => {
    if (!keep) return;
    count += 1;
    for (let d = 0; d < dims; d += 1) out[d] = (out[d] ?? 0) + (hidden[token * dims + d] ?? 0);
  });
  if (count > 0) for (let d = 0; d < dims; d += 1) out[d] = (out[d] ?? 0) / count;
  return out;
}

/** Scaled to length one, so a dot product is the cosine. A vector of nothing stays nothing. */
export function normalise(vector: Float32Array): Float32Array {
  let sum = 0;
  for (const value of vector) sum += value * value;
  const length = Math.sqrt(sum);
  if (length === 0) return vector;
  return vector.map((value) => value / length);
}

/* ---- Kept small, compared quickly ------------------------------------------- */

/** One byte a number: a length-one vector never leaves [-1, 1]. */
export function toBytes(vector: Float32Array): Int8Array {
  return Int8Array.from(vector, (value) => Math.max(-127, Math.min(127, Math.round(value * 127))));
}

export function fromBytes(bytes: Int8Array): Float32Array {
  return Float32Array.from(bytes, (value) => value / 127);
}

/** How alike two lines are, from -1 to 1. Both are length one, so this is the dot product. */
export function similarity(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let sum = 0;
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i += 1) sum += (a[i] ?? 0) * (b[i] ?? 0);
  return sum;
}

/** The nearest few to a line, most alike first, at least `floor` alike. */
export function nearest<T extends { vector: ArrayLike<number> }>(
  query: ArrayLike<number>,
  among: readonly T[],
  most = 5,
  floor = 0,
): (T & { score: number })[] {
  return among
    .map((each) => ({ ...each, score: similarity(query, each.vector) }))
    .filter((each) => each.score >= floor)
    .sort((a, b) => b.score - a.score)
    .slice(0, most);
}

/** What a line is kept by, so text that has not changed is never read again. FNV-1a: quick, and a collision only costs one re-read. */
export function textHash(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/** What Settings says about understanding: whether it is on, whether the model is here, and how far reading has got. */
export type UnderstandState = {
  on: boolean;
  here: boolean;
  /** Things read, and waiting to be. */
  read: number;
  waiting: number;
};
