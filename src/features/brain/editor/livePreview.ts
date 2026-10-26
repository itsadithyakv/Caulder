import { syntaxTree } from "@codemirror/language";
import { StateEffect, StateField, type EditorState, type Range } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import { isLinkKind, parseLinks, unfinishedLinks, type LinkRef, type LinkedName } from "@shared/links";

/**
 * Writing that looks like what it will be, as Obsidian's live preview does.
 *
 * The text underneath stays the page's markdown - search, links, the lock and
 * the history all read it - but what is on screen is the result: a heading is
 * a heading without its `##`, bold is bold without its stars, a bullet is a
 * dot, a step is a box to tick. The marks come back on the line the cursor is
 * on, so they can be edited like any other character.
 *
 * A link into the brain is a chip with the current name of what it points
 * at, everywhere, cursor or not: the id behind it is never anybody's to type.
 * The chip is one character to the cursor - arrows step over it and
 * Backspace takes it whole - and Ctrl+click opens it.
 */

/* ---- The names chips show ------------------------------------------------ */

/** The current names of what the page links to, sent in when they change. */
export const setLinkNames = StateEffect.define<Readonly<Record<string, LinkedName>>>();

const linkNames = StateField.define<Readonly<Record<string, LinkedName>>>({
  create: () => ({}),
  update: (names, transaction) => {
    for (const effect of transaction.effects) if (effect.is(setLinkNames)) return effect.value;
    return names;
  },
});

/* ---- Widgets ------------------------------------------------------------- */

class ChipWidget extends WidgetType {
  constructor(
    readonly name: string,
    readonly kind: string,
    readonly ref: LinkRef,
  ) {
    super();
  }

  override eq(other: ChipWidget): boolean {
    return other.name === this.name && other.kind === this.kind && other.ref.id === this.ref.id;
  }

  toDOM(): HTMLElement {
    const chip = document.createElement("span");
    chip.className = `cm-chip brainlink brainlink--${this.kind}`;
    chip.textContent = this.name;
    chip.title = "Ctrl+click to open";
    chip.dataset["ref"] = `${this.ref.kind}:${this.ref.id}`;
    return chip;
  }

  override ignoreEvent(): boolean {
    return false;
  }
}

class BulletWidget extends WidgetType {
  override eq(): boolean {
    return true;
  }

  toDOM(): HTMLElement {
    const dot = document.createElement("span");
    dot.className = "cm-bullet";
    dot.textContent = "•";
    return dot;
  }
}

class TickWidget extends WidgetType {
  constructor(
    readonly checked: boolean,
    readonly at: number,
  ) {
    super();
  }

  override eq(other: TickWidget): boolean {
    return other.checked === this.checked && other.at === this.at;
  }

  toDOM(view: EditorView): HTMLElement {
    const box = document.createElement("input");
    box.type = "checkbox";
    box.className = "cm-tick tickbox";
    box.checked = this.checked;
    box.setAttribute("aria-label", this.checked ? "Done - untick" : "Tick off");
    box.addEventListener("mousedown", (event) => {
      event.preventDefault();
      // "[ ]" <-> "[x]": the middle character is the whole of the change.
      view.dispatch({ changes: { from: this.at + 1, to: this.at + 2, insert: this.checked ? " " : "x" } });
    });
    return box;
  }

  override ignoreEvent(): boolean {
    return true;
  }
}

class RuleWidget extends WidgetType {
  override eq(): boolean {
    return true;
  }

  toDOM(): HTMLElement {
    const rule = document.createElement("span");
    rule.className = "cm-rule";
    return rule;
  }
}

/* ---- Building the decorations -------------------------------------------- */

const hide = Decoration.replace({});
const bullet = Decoration.replace({ widget: new BulletWidget() });
const rule = Decoration.replace({ widget: new RuleWidget() });
const mark = (className: string) => Decoration.mark({ class: className });
const unlinked = Decoration.mark({
  class: "cm-unlinked",
  attributes: { title: "Not linked yet: click to choose what it links to" },
});
const line = (className: string) => Decoration.line({ class: className });

/** The lines the cursor or a selection touches: their marks stay visible. */
function activeLines(state: EditorState): Set<number> {
  const lines = new Set<number>();
  for (const range of state.selection.ranges) {
    const first = state.doc.lineAt(range.from).number;
    const last = state.doc.lineAt(range.to).number;
    for (let number = first; number <= last; number += 1) lines.add(number);
  }
  return lines;
}

function build(view: EditorView): { all: DecorationSet; chips: DecorationSet } {
  const { state } = view;
  const active = activeLines(state);
  const focused = view.hasFocus;
  /** Whether the lines from..to are being edited, so their marks show. */
  const editing = (from: number, to: number) => {
    if (!focused) return false;
    const first = state.doc.lineAt(from).number;
    const last = state.doc.lineAt(to).number;
    for (let number = first; number <= last; number += 1) if (active.has(number)) return true;
    return false;
  };

  const ranges: Range<Decoration>[] = [];
  const chips: Range<Decoration>[] = [];
  const names = state.field(linkNames, false) ?? {};

  for (const visible of view.visibleRanges) {
    const from = state.doc.lineAt(visible.from).from;
    const to = state.doc.lineAt(visible.to).to;

    // Links into the brain, as chips.
    const text = state.doc.sliceString(from, to);
    for (const link of parseLinks(text)) {
      const known = names[`${link.kind}:${link.id}`];
      const chip = Decoration.replace({
        widget: new ChipWidget(known?.name ?? link.label, known?.kind ?? link.kind, { kind: link.kind, id: link.id }),
      }).range(from + link.start, from + link.end);
      chips.push(chip);
      ranges.push(chip);
    }
    const inChip = (at: number) => chips.some((chip) => chip.from <= at && at < chip.to);

    // Links begun and never finished: underlined, and a click finishes them (LinkedEditor).
    for (const unfinished of unfinishedLinks(text)) {
      ranges.push(unlinked.range(from + unfinished.start, from + unfinished.end));
    }

    syntaxTree(state).iterate({
      from,
      to,
      enter: (node) => {
        const { name } = node;
        const heading = /^ATXHeading(\d)$/.exec(name);
        if (heading) {
          ranges.push(line(`cm-md-h cm-md-h${heading[1]}`).range(state.doc.lineAt(node.from).from));
          return;
        }
        switch (name) {
          case "HeaderMark": {
            const parent = node.node.parent;
            if (parent && /^ATXHeading/.test(parent.name) && !editing(node.from, node.to)) {
              const next = state.doc.sliceString(node.to, node.to + 1);
              ranges.push(hide.range(node.from, next === " " ? node.to + 1 : node.to));
            }
            return;
          }
          case "StrongEmphasis":
            ranges.push(mark("cm-md-strong").range(node.from, node.to));
            return;
          case "Emphasis":
            ranges.push(mark("cm-md-em").range(node.from, node.to));
            return;
          case "Strikethrough":
            ranges.push(mark("cm-md-strike").range(node.from, node.to));
            return;
          case "InlineCode":
            ranges.push(mark("cm-md-code").range(node.from, node.to));
            return;
          case "EmphasisMark":
          case "StrikethroughMark":
          case "CodeMark": {
            const parent = node.node.parent;
            if (parent && parent.name !== "FencedCode" && !editing(parent.from, parent.to) && !inChip(node.from)) {
              ranges.push(hide.range(node.from, node.to));
            }
            return;
          }
          case "Blockquote": {
            for (let at = node.from; at <= node.to; ) {
              const each = state.doc.lineAt(at);
              ranges.push(line("cm-md-quote").range(each.from));
              at = each.to + 1;
            }
            return;
          }
          case "QuoteMark":
            if (!editing(node.from, node.to)) {
              const next = state.doc.sliceString(node.to, node.to + 1);
              ranges.push(hide.range(node.from, next === " " ? node.to + 1 : node.to));
            }
            return;
          case "ListMark": {
            const item = node.node.parent;
            if (!item || editing(node.from, node.to)) return;
            const marker = state.doc.sliceString(node.from, node.to);
            const task = item.getChild("Task");
            const next = state.doc.sliceString(node.to, node.to + 1);
            if (task) {
              // The box stands in for the bullet.
              ranges.push(hide.range(node.from, next === " " ? node.to + 1 : node.to));
            } else if (/^[-*+]$/.test(marker)) {
              ranges.push(bullet.range(node.from, node.to));
            }
            return;
          }
          case "TaskMarker": {
            if (editing(node.from, node.to)) return;
            const checked = /x/i.test(state.doc.sliceString(node.from, node.to));
            ranges.push(Decoration.replace({ widget: new TickWidget(checked, node.from) }).range(node.from, node.to));
            if (checked) {
              const each = state.doc.lineAt(node.to);
              if (node.to + 1 < each.to) ranges.push(mark("cm-md-done").range(node.to + 1, each.to));
            }
            return;
          }
          case "HorizontalRule":
            if (!editing(node.from, node.to)) ranges.push(rule.range(node.from, node.to));
            return;
          case "Link": {
            ranges.push(mark("cm-md-link").range(node.from, node.to));
            if (editing(node.from, node.to)) return;
            const cursor = node.node.cursor();
            if (cursor.firstChild()) {
              do {
                if (cursor.name === "LinkMark" || cursor.name === "URL") ranges.push(hide.range(cursor.from, cursor.to));
              } while (cursor.nextSibling());
            }
            return false;
          }
          case "FencedCode":
            for (let at = node.from; at <= node.to; ) {
              const each = state.doc.lineAt(at);
              ranges.push(line("cm-md-fence").range(each.from));
              at = each.to + 1;
            }
            return false;
          default:
            return;
        }
      },
    });
  }

  // Nothing else that hides text may reach into a chip: a star in a link's name is not bold's.
  const clean = ranges.filter(
    (range) => chips.includes(range) || !(range.value.point && chips.some((chip) => range.from < chip.to && chip.from < range.to)),
  );
  return { all: Decoration.set(clean, true), chips: Decoration.set(chips, true) };
}

class LivePreview {
  decorations: DecorationSet;
  chips: DecorationSet;

  constructor(view: EditorView) {
    const built = build(view);
    this.decorations = built.all;
    this.chips = built.chips;
  }

  update(update: ViewUpdate) {
    const namesChanged = update.transactions.some((transaction) =>
      transaction.effects.some((effect) => effect.is(setLinkNames)),
    );
    if (
      update.docChanged ||
      update.viewportChanged ||
      update.selectionSet ||
      update.focusChanged ||
      namesChanged ||
      syntaxTree(update.startState) !== syntaxTree(update.state)
    ) {
      const built = build(update.view);
      this.decorations = built.all;
      this.chips = built.chips;
    }
  }
}

const preview = ViewPlugin.fromClass(LivePreview, {
  decorations: (plugin) => plugin.decorations,
  provide: (plugin) =>
    EditorView.atomicRanges.of((view) => view.plugin(plugin)?.chips ?? Decoration.none),
});

/** The link a click landed on, if it was a chip. */
export function linkAt(target: EventTarget | null): LinkRef | null {
  const chip = target instanceof HTMLElement ? target.closest<HTMLElement>(".cm-chip") : null;
  const ref = chip?.dataset["ref"] ?? "";
  const at = ref.indexOf(":");
  const kind = ref.slice(0, at);
  return at > 0 && isLinkKind(kind) ? { kind, id: ref.slice(at + 1) } : null;
}

export function livePreview() {
  return [linkNames, preview];
}
