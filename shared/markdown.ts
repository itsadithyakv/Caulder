import { linkLabelsOnly, parseLinks, type LinkKind } from "./links";

/**
 * Just enough Markdown for a page in the brain.
 *
 * Parsed into a small tree that the window renders as elements - never as an
 * HTML string - so nothing a page says can become markup. Headings, lists
 * with tick boxes, quotes, code, simple tables, bold, italics, inline code,
 * web links and links into the brain (shared/links.ts). Anything else stays
 * the text it was.
 *
 * Written here rather than taken from a library because the whole of what a
 * founder's notes need is this, and a library would be a dependency, a
 * sanitiser and a set of options to get wrong.
 */

export type Inline =
  | { kind: "text"; text: string }
  | { kind: "strong"; children: Inline[] }
  | { kind: "em"; children: Inline[] }
  | { kind: "code"; text: string }
  | { kind: "link"; href: string; children: Inline[] }
  /** A link to a page or a contact, by id; drawn with the target's current name. */
  | { kind: "brainlink"; target: LinkKind; id: string; label: string };

export type ListItem = {
  /** Null for a plain item; true or false for a tick box. */
  checked: boolean | null;
  inline: Inline[];
  /** The source line, so a tick box can be flipped in the text. */
  line: number;
};

export type Block =
  | { kind: "heading"; level: 1 | 2 | 3; inline: Inline[] }
  | { kind: "paragraph"; inline: Inline[] }
  | { kind: "list"; ordered: boolean; items: ListItem[] }
  | { kind: "quote"; inline: Inline[] }
  | { kind: "code"; text: string }
  | { kind: "table"; header: Inline[][]; rows: Inline[][][] }
  | { kind: "rule" };

const BULLET = /^\s*(?:[-*+])\s+(?:\[( |x|X)\]\s?)?(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(?:\[( |x|X)\]\s?)?(.*)$/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const RULE = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
const TABLE_DIVIDER = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;

export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let paragraph: string[] = [];

  const flush = () => {
    if (paragraph.length > 0) {
      blocks.push({ kind: "paragraph", inline: parseInline(paragraph.join("\n")) });
      paragraph = [];
    }
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";

    if (line.trim() === "") {
      flush();
      i += 1;
      continue;
    }

    if (line.trimStart().startsWith("```")) {
      flush();
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !(lines[i] ?? "").trimStart().startsWith("```")) {
        body.push(lines[i] ?? "");
        i += 1;
      }
      blocks.push({ kind: "code", text: body.join("\n") });
      i += 1;
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      flush();
      const level = Math.min(3, (heading[1] ?? "#").length) as 1 | 2 | 3;
      blocks.push({ kind: "heading", level, inline: parseInline((heading[2] ?? "").trim()) });
      i += 1;
      continue;
    }

    if (RULE.test(line)) {
      flush();
      blocks.push({ kind: "rule" });
      i += 1;
      continue;
    }

    if (line.trimStart().startsWith(">")) {
      flush();
      const quoted: string[] = [];
      while (i < lines.length && (lines[i] ?? "").trimStart().startsWith(">")) {
        quoted.push((lines[i] ?? "").trimStart().replace(/^>\s?/, ""));
        i += 1;
      }
      blocks.push({ kind: "quote", inline: parseInline(quoted.join("\n")) });
      continue;
    }

    if (line.includes("|") && TABLE_DIVIDER.test(lines[i + 1] ?? "")) {
      flush();
      const header = cells(line);
      const rows: Inline[][][] = [];
      i += 2;
      while (i < lines.length && (lines[i] ?? "").includes("|") && (lines[i] ?? "").trim() !== "") {
        rows.push(cells(lines[i] ?? ""));
        i += 1;
      }
      blocks.push({ kind: "table", header, rows });
      continue;
    }

    const bullet = BULLET.exec(line);
    const numbered = bullet ? null : NUMBERED.exec(line);
    if (bullet || numbered) {
      flush();
      const ordered = numbered !== null;
      const pattern = ordered ? NUMBERED : BULLET;
      const items: ListItem[] = [];
      while (i < lines.length) {
        const match = pattern.exec(lines[i] ?? "");
        if (!match) break;
        items.push({
          checked: match[1] === undefined ? null : match[1].toLowerCase() === "x",
          inline: parseInline((match[2] ?? "").trim()),
          line: i,
        });
        i += 1;
      }
      blocks.push({ kind: "list", ordered, items });
      continue;
    }

    paragraph.push(line);
    i += 1;
  }

  flush();
  return blocks;
}

function cells(line: string): Inline[][] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => parseInline(cell.trim()));
}

/**
 * Bold, italics, inline code and links. Unclosed markers stay as text, which
 * is what a person reading the raw note would expect to see.
 */
export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let plain = "";
  let i = 0;

  const push = () => {
    if (plain) {
      out.push({ kind: "text", text: plain });
      plain = "";
    }
  };

  while (i < text.length) {
    const rest = text.slice(i);

    if (rest.startsWith("`")) {
      const end = text.indexOf("`", i + 1);
      if (end > i + 1) {
        push();
        out.push({ kind: "code", text: text.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }

    if (rest.startsWith("**") || rest.startsWith("__")) {
      const marker = rest.slice(0, 2);
      const end = text.indexOf(marker, i + 2);
      if (end > i + 2) {
        push();
        out.push({ kind: "strong", children: parseInline(text.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    }

    if ((rest.startsWith("*") || rest.startsWith("_")) && !/^[*_]\s/.test(rest)) {
      const marker = rest[0] as string;
      // An underscore inside a word (snake_case) is not emphasis.
      const before = text[i - 1];
      if (marker === "*" || !before || !/\w/.test(before)) {
        const end = text.indexOf(marker, i + 1);
        if (end > i + 1 && text[end - 1] !== " ") {
          push();
          out.push({ kind: "em", children: parseInline(text.slice(i + 1, end)) });
          i = end + 1;
          continue;
        }
      }
    }

    if (rest.startsWith("[[")) {
      const brain = parseLinks(rest)[0];
      if (brain && brain.start === 0) {
        push();
        out.push({ kind: "brainlink", target: brain.kind, id: brain.id, label: brain.label });
        i += brain.end;
        continue;
      }
    }

    if (rest.startsWith("[")) {
      const link = /^\[([^\]]+)\]\(([^)\s]+)\)/.exec(rest);
      if (link && isWebLink(link[2] ?? "")) {
        push();
        out.push({ kind: "link", href: link[2] ?? "", children: parseInline(link[1] ?? "") });
        i += link[0].length;
        continue;
      }
    }

    // A bare address becomes a link too, because people paste them.
    const bare = /^https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"]/.exec(rest);
    if (bare && (i === 0 || /\s|\(/.test(text[i - 1] ?? ""))) {
      push();
      out.push({ kind: "link", href: bare[0], children: [{ kind: "text", text: bare[0] }] });
      i += bare[0].length;
      continue;
    }

    plain += text[i];
    i += 1;
  }

  push();
  return out;
}

/** Only the web opens from a page. Main enforces the same rule again. */
function isWebLink(href: string): boolean {
  return /^https?:\/\/[^\s]+$/i.test(href);
}

/** Flips the tick box on one source line, leaving every other character alone. */
export function toggleTick(source: string, line: number): string {
  const lines = source.split("\n");
  const target = lines[line];
  if (target === undefined) return source;
  const flipped = target.replace(/^(\s*(?:[-*+]|\d+[.)])\s+)\[( |x|X)\]/, (_all, lead: string, mark: string) =>
    `${lead}[${mark === " " ? "x" : " "}]`,
  );
  lines[line] = flipped;
  return lines.join("\n");
}

/** The words of a page with the markup taken off, for an excerpt. */
export function plainText(source: string): string {
  return linkLabelsOnly(source)
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s?)?/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
