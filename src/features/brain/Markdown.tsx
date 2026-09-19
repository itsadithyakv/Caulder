import { createContext, useContext, useMemo } from "react";
import { parseMarkdown, plainText, type Block, type Inline } from "@shared/markdown";
import type { LinkRef, LinkedName } from "@shared/links";

/**
 * A page's text, drawn from the tree shared/markdown.ts parses.
 *
 * Elements only - nothing here sets HTML - so whatever a page says stays text.
 * Headings sit a level below the page's own title, so a page's outline reads
 * correctly to a screen reader. Tick boxes can be ticked in place when the
 * page allows it; the page saves the flipped line. A link into the brain is
 * a chip with its target's current name.
 */

/** What a page's links point at, for the chips inside its text. */
type Linking = {
  names: Readonly<Record<string, LinkedName>>;
  open: ((ref: LinkRef) => void) | undefined;
};

const NO_LINKS: Readonly<Record<string, LinkedName>> = {};

const LinkContext = createContext<Linking>({ names: NO_LINKS, open: undefined });

export function Markdown({
  source,
  onTick,
  links = NO_LINKS,
  onOpenLink,
}: {
  source: string;
  /** Given, tick boxes are live; the number is the source line to flip. */
  onTick?: (line: number) => void;
  /** Current names of the things linked to, by "kind:id". A link not here is shown as words. */
  links?: Readonly<Record<string, LinkedName>>;
  onOpenLink?: (ref: LinkRef) => void;
}) {
  const blocks = useMemo(() => parseMarkdown(source), [source]);
  const linking = useMemo(() => ({ names: links, open: onOpenLink }), [links, onOpenLink]);
  return (
    <LinkContext.Provider value={linking}>
      <div className="prose">
        {blocks.map((block, index) => (
          <BlockView key={index} block={block} onTick={onTick} />
        ))}
      </div>
    </LinkContext.Provider>
  );
}

/**
 * A link into the brain: the target's current name, in the colour of its dot
 * on the Map. A target since deleted leaves the words it was written with.
 */
function BrainLink({ target, id, label }: { target: LinkRef["kind"]; id: string; label: string }) {
  const { names, open } = useContext(LinkContext);
  const known = names[`${target}:${id}`];
  if (!known) return <span className="brainlink brainlink--gone">{label}</span>;
  return (
    <button
      type="button"
      className={`brainlink brainlink--${known.kind}`}
      onClick={() => open?.({ kind: target, id })}
      disabled={!open}
    >
      {known.name}
    </button>
  );
}

function BlockView({ block, onTick }: { block: Block; onTick: ((line: number) => void) | undefined }) {
  switch (block.kind) {
    case "heading": {
      const Tag = block.level === 1 ? "h3" : block.level === 2 ? "h4" : "h5";
      return (
        <Tag className={`prose__h${block.level}`}>
          <Inlines items={block.inline} />
        </Tag>
      );
    }
    case "paragraph":
      return (
        <p className="prose__p">
          <Inlines items={block.inline} />
        </p>
      );
    case "quote":
      return (
        <blockquote className="prose__quote">
          <Inlines items={block.inline} />
        </blockquote>
      );
    case "code":
      return <pre className="prose__code">{block.text}</pre>;
    case "rule":
      return <hr className="prose__rule" />;
    case "table":
      return (
        <div className="prose__tableWrap">
          <table className="prose__table">
            <thead>
              <tr>
                {block.header.map((cell, index) => (
                  <th key={index}>
                    <Inlines items={cell} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, index) => (
                    <td key={index}>
                      <Inlines items={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "list": {
      const Tag = block.ordered ? "ol" : "ul";
      const ticks = block.items.some((item) => item.checked !== null);
      return (
        <Tag className={`prose__list${ticks ? " prose__list--ticks" : ""}`}>
          {block.items.map((item) => (
            <li key={item.line} className="prose__item">
              {item.checked === null ? (
                <Inlines items={item.inline} />
              ) : (
                <label className="prose__tick">
                  <input
                    type="checkbox"
                    className="tickbox"
                    checked={item.checked}
                    disabled={!onTick}
                    onChange={() => onTick?.(item.line)}
                    aria-label={textOf(item.inline) || "Step"}
                  />
                  <span className={item.checked ? "prose__done" : undefined}>
                    <Inlines items={item.inline} />
                  </span>
                </label>
              )}
            </li>
          ))}
        </Tag>
      );
    }
  }
}

function Inlines({ items }: { items: Inline[] }) {
  return (
    <>
      {items.map((item, index) => {
        switch (item.kind) {
          case "text":
            return <span key={index}>{item.text}</span>;
          case "strong":
            return (
              <strong key={index}>
                <Inlines items={item.children} />
              </strong>
            );
          case "em":
            return (
              <em key={index}>
                <Inlines items={item.children} />
              </em>
            );
          case "code":
            return (
              <code key={index} className="prose__inlineCode">
                {item.text}
              </code>
            );
          case "brainlink":
            return <BrainLink key={index} target={item.target} id={item.id} label={item.label} />;
          case "link":
            return (
              // Opened by the system browser: main hands out only web links.
              <a key={index} href={item.href} target="_blank" rel="noreferrer noopener">
                <Inlines items={item.children} />
              </a>
            );
        }
      })}
    </>
  );
}

function textOf(items: Inline[]): string {
  return plainText(
    items
      .map((item) =>
        item.kind === "text" || item.kind === "code"
          ? item.text
          : item.kind === "brainlink"
            ? item.label
            : textOf(item.children),
      )
      .join(""),
  );
}
