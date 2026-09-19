/**
 * Links between things in the brain (PLAN.md, phase 7).
 *
 * A link is written into a page's text as
 *
 *     [[Pricing|page:3f0c…]]      [[Oakridge School|contact:9a1e…]]
 *
 * and, since phase 16, to a product, a person or a document the same way:
 * `product:`, `person:`, `document:`.
 *
 * The id is what the link means, so renaming the page or the contact never
 * breaks it; the label is only what was written, kept so the text still reads
 * if the target is deleted - the words stay, the link goes. On screen the
 * label is replaced by the target's current name.
 */

import type { MapKind } from "./map";

export const LINK_KINDS = ["page", "contact", "product", "person", "document"] as const;
export type LinkKind = (typeof LINK_KINDS)[number];

export function isLinkKind(value: unknown): value is LinkKind {
  return typeof value === "string" && (LINK_KINDS as readonly string[]).includes(value);
}

/** A link's target as the page shows it: its current name, and what kind of dot it is. */
export type LinkedName = { name: string; kind: MapKind };

export type LinkRef = { kind: LinkKind; id: string };

type ParsedLink = LinkRef & { label: string; start: number; end: number };

/** Something `[[` can link to, as the picker lists it. */
export type LinkTarget = LinkRef & { name: string; detail: string };

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/** A fresh pattern each time: a shared /g regex keeps its position between calls. */
function tokens(): RegExp {
  return new RegExp(`\\[\\[([^\\]|\\n]{1,160})\\|(page|contact|product|person|document):(${UUID})\\]\\]`, "g");
}

export function parseLinks(text: string): ParsedLink[] {
  const out: ParsedLink[] = [];
  for (const match of text.matchAll(tokens())) {
    out.push({
      label: (match[1] ?? "").trim(),
      kind: match[2] as LinkKind,
      id: match[3] ?? "",
      start: match.index ?? 0,
      end: (match.index ?? 0) + match[0].length,
    });
  }
  return out;
}

/** Each thing linked once, in the order first written. */
export function linkTargets(text: string): (LinkRef & { label: string })[] {
  const seen = new Set<string>();
  const out: (LinkRef & { label: string })[] = [];
  for (const link of parseLinks(text)) {
    const key = keyOf(link);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ kind: link.kind, id: link.id, label: link.label });
  }
  return out;
}

export function keyOf(ref: LinkRef): string {
  return `${ref.kind}:${ref.id}`;
}

/** The token for a link, with a label that cannot break out of it. */
export function linkToken(label: string, ref: LinkRef): string {
  const safe = label.replace(/[\]|\n\r]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 160) || "Untitled";
  return `[[${safe}|${ref.kind}:${ref.id}]]`;
}

/** A line with nothing on it but links, the way the Map writes them: `[[A|page:…]] · [[B|contact:…]]`. */
function linksOnly(line: string): boolean {
  return parseLinks(line).length > 0 && line.replace(tokens(), "").replace(/[\s·]+/g, "") === "";
}

const same = (link: LinkRef, ref: LinkRef) => link.kind === ref.kind && link.id === ref.id;

/**
 * The text with a link to `ref` added, for a link made on the Map rather than
 * typed. It goes on the page's last line when that line is only links, and on
 * a line of its own at the foot otherwise - so links made by dragging gather
 * in one place, and read as text like any other. Unchanged when the page
 * already links there.
 */
export function withLink(text: string, label: string, ref: LinkRef): string {
  if (parseLinks(text).some((link) => same(link, ref))) return text;
  const token = linkToken(label, ref);
  const kept = text.replace(/\s+$/, "");
  if (kept === "") return token;
  const lines = kept.split("\n");
  const last = lines[lines.length - 1] ?? "";
  if (!linksOnly(last)) return `${kept}\n\n${token}`;
  lines[lines.length - 1] = `${last} · ${token}`;
  return lines.join("\n");
}

/**
 * The text with every link to `ref` taken out. On a line of links the link
 * goes, with the dot beside it, and an emptied line goes too; inside a
 * sentence the words stay and only the link goes, so nothing written stops
 * reading.
 */
export function withoutLink(text: string, ref: LinkRef): string {
  let dropped = false;
  const lines = text.split("\n").flatMap((line) => {
    const links = parseLinks(line);
    if (!links.some((link) => same(link, ref))) return [line];
    if (linksOnly(line)) {
      const rest = links.filter((link) => !same(link, ref)).map((link) => line.slice(link.start, link.end));
      if (rest.length > 0) return [rest.join(" · ")];
      dropped = true;
      return [];
    }
    return [
      line.replace(tokens(), (whole, label: string, kind: string, id: string) =>
        kind === ref.kind && id === ref.id ? label : whole,
      ),
    ];
  });
  const out = lines.join("\n");
  return dropped ? out.replace(/\n{3,}/g, "\n\n").replace(/\s+$/, "") : out;
}

/** The text with every link's label brought up to date, for editing. */
export function refreshLabels(text: string, names: Readonly<Record<string, string>>): string {
  return text.replace(tokens(), (whole, label: string, kind: string, id: string) => {
    const name = names[`${kind}:${id}`];
    return name === undefined || name === label ? whole : linkToken(name, { kind: kind as LinkKind, id });
  });
}

/** The text with links reduced to their words, for excerpts and exports. */
export function linkLabelsOnly(text: string, names: Readonly<Record<string, string>> = {}): string {
  return text.replace(tokens(), (_whole, label: string, kind: string, id: string) => names[`${kind}:${id}`] ?? label);
}

/**
 * Where `[[` is being typed: the text after it up to the caret, when the caret
 * is still inside an unfinished link. Null otherwise.
 */
export function openLinkQuery(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const start = before.lastIndexOf("[[");
  if (start === -1) return null;
  const query = before.slice(start + 2);
  if (/[\]\n|]/.test(query) || query.length > 60) return null;
  return { start, query };
}
