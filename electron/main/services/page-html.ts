import { parseMarkdown, type Block, type Inline } from "@shared/markdown";
import type { LinkKind } from "@shared/links";

/**
 * A brain page as HTML, for the two things that leave Caulder to be read by
 * somebody else: the data room and the company handbook (PLAN.md, phase 13).
 *
 * The window never renders a page as an HTML string - it draws the parsed
 * tree as elements, so nothing a page says can become markup. This is the
 * same tree written out as text, with every value escaped on the way, for a
 * file or a printer. Pure, so what a handbook says can be tested without a
 * window.
 */

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * What a link into the brain becomes: a link to wherever the other page is
 * in this document or folder, or its name in bold when it is not in it - a
 * contact, or a page that was left out.
 */
export type LinkResolver = (kind: LinkKind, id: string, label: string) => { href: string | null; text: string };

function inlineHtml(inline: readonly Inline[], resolve: LinkResolver): string {
  return inline
    .map((part) => {
      switch (part.kind) {
        case "text":
          return escapeHtml(part.text).replace(/\n/g, "<br>");
        case "strong":
          return `<strong>${inlineHtml(part.children, resolve)}</strong>`;
        case "em":
          return `<em>${inlineHtml(part.children, resolve)}</em>`;
        case "code":
          return `<code>${escapeHtml(part.text)}</code>`;
        case "link":
          // The parser only makes web links; checked again, since this goes into an href.
          return /^https?:\/\//i.test(part.href)
            ? `<a href="${escapeHtml(part.href)}">${inlineHtml(part.children, resolve)}</a>`
            : inlineHtml(part.children, resolve);
        case "unlinked":
          return escapeHtml(part.text);
        case "brainlink": {
          const target = resolve(part.target, part.id, part.label);
          return target.href
            ? `<a href="${escapeHtml(target.href)}">${escapeHtml(target.text)}</a>`
            : `<strong>${escapeHtml(target.text)}</strong>`;
        }
      }
    })
    .join("");
}

function blockHtml(block: Block, resolve: LinkResolver): string {
  switch (block.kind) {
    case "heading": {
      // A page's own title is the heading above it, so its headings start a level down.
      const tag = `h${block.level + 2}`;
      return `<${tag}>${inlineHtml(block.inline, resolve)}</${tag}>`;
    }
    case "paragraph":
      return `<p>${inlineHtml(block.inline, resolve)}</p>`;
    case "quote":
      return `<blockquote>${inlineHtml(block.inline, resolve)}</blockquote>`;
    case "code":
      return `<pre>${escapeHtml(block.text)}</pre>`;
    case "rule":
      return "<hr>";
    case "list": {
      const tag = block.ordered ? "ol" : "ul";
      const ticks = block.items.some((item) => item.checked !== null);
      const items = block.items
        .map((item) => {
          const box = item.checked === null ? "" : `<span class="tick">${item.checked ? "☑" : "☐"}</span> `;
          return `<li>${box}${inlineHtml(item.inline, resolve)}</li>`;
        })
        .join("");
      return `<${tag}${ticks ? ' class="ticks"' : ""}>${items}</${tag}>`;
    }
    case "table": {
      const head = block.header.map((cell) => `<th>${inlineHtml(cell, resolve)}</th>`).join("");
      const rows = block.rows
        .map((row) => `<tr>${row.map((cell) => `<td>${inlineHtml(cell, resolve)}</td>`).join("")}</tr>`)
        .join("");
      return `<table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`;
    }
  }
}

export function markdownHtml(source: string, resolve: LinkResolver): string {
  return parseMarkdown(source)
    .map((block) => blockHtml(block, resolve))
    .join("\n");
}

/** The facts on top of a page, as a two-column table. Nothing when there are none. */
export function factsHtml(facts: readonly { label: string; value: string }[]): string {
  if (facts.length === 0) return "";
  const rows = facts
    .map(
      (fact) =>
        `<tr><th scope="row">${escapeHtml(fact.label)}</th><td>${escapeHtml(fact.value).replace(/\n/g, "<br>")}</td></tr>`,
    )
    .join("");
  return `<table class="facts"><tbody>${rows}</tbody></table>`;
}

/** A table of plain values: the people, the catalogue, the documents. */
export function tableHtml(head: readonly string[], rows: readonly (readonly (string | { html: string })[])[]): string {
  const cell = (value: string | { html: string }) => (typeof value === "string" ? escapeHtml(value) : value.html);
  return `<table><thead><tr>${head.map((label) => `<th>${escapeHtml(label)}</th>`).join("")}</tr></thead><tbody>${rows
    .map((row) => `<tr>${row.map((value) => `<td>${cell(value)}</td>`).join("")}</tr>`)
    .join("")}</tbody></table>`;
}

/**
 * The look both documents share: plain, printable, and readable in any
 * browser the data room is opened in. System fonts, one accent of ink.
 */
const DOCUMENT_STYLE = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { font: 14px/1.6 -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; color: #1a1f2b; background: #fff; margin: 0; }
  main { max-width: 780px; margin: 0 auto; padding: 48px 32px 64px; }
  h1 { font-size: 28px; line-height: 1.2; margin: 0 0 6px; letter-spacing: -0.01em; }
  h2 { font-size: 20px; line-height: 1.3; margin: 36px 0 8px; }
  h3 { font-size: 16px; margin: 24px 0 6px; }
  h4, h5 { font-size: 14px; margin: 18px 0 4px; }
  p, ul, ol, blockquote, pre, table { margin: 0 0 12px; }
  a { color: #1f5fbf; }
  code, pre { font-family: Consolas, "SF Mono", Menlo, monospace; font-size: 12.5px; background: #f3f4f7; border-radius: 4px; }
  code { padding: 1px 4px; }
  pre { padding: 10px 12px; white-space: pre-wrap; }
  blockquote { border-left: 3px solid #d6d9e0; padding-left: 12px; color: #4a5263; }
  hr { border: 0; border-top: 1px solid #e3e5ea; margin: 24px 0; }
  ul.ticks { list-style: none; padding-left: 4px; }
  .tick { font-size: 15px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #e3e5ea; vertical-align: top; }
  thead th { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: #6b7384; border-bottom-color: #c9ccd6; }
  table.facts th { width: 34%; color: #4a5263; font-weight: 600; }
  .sub { color: #6b7384; margin: 0 0 24px; }
  .meta { color: #6b7384; font-size: 12px; margin: -2px 0 12px; }
  .note { color: #6b7384; font-size: 12.5px; }
  .back { display: inline-block; margin-bottom: 24px; font-size: 13px; }
  .toc { padding-left: 20px; }
  .toc li { margin: 2px 0; }
  .page { break-inside: auto; }
  .chapter { break-before: page; }
  .cover { min-height: 88vh; display: flex; flex-direction: column; justify-content: center; }
  .cover h1 { font-size: 40px; }
  .cover .logo { width: 72px; height: 72px; object-fit: contain; margin-bottom: 24px; }
  .cover .what { font-size: 13px; text-transform: uppercase; letter-spacing: 0.12em; color: #6b7384; margin: 0 0 12px; }
  .cover .oneliner { font-size: 18px; color: #3a4252; margin: 12px 0 0; }
  @media print {
    main { padding: 0; max-width: none; }
    a { color: inherit; text-decoration: none; }
    h2, h3 { break-after: avoid; }
    tr, li { break-inside: avoid; }
  }
`;

/** A whole HTML document around a body. */
export function documentHtml(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(
    title,
  )}</title><style>${DOCUMENT_STYLE}</style></head><body><main>${body}</main></body></html>`;
}
