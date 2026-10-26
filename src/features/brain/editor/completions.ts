import {
  autocompletion,
  startCompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import type { EditorView } from "@codemirror/view";
import { isSection, sectionOf } from "@shared/brain";
import { linkToken, type LinkTarget } from "@shared/links";
import { mapKindOf } from "@shared/map";

/**
 * The two lists that open while writing.
 *
 * **Links.** `@` - the way a person is mentioned anywhere else - or `[[`, for
 * those who know it, opens a list of the pages, contacts, products, people
 * and documents whose names contain what follows. Picking one writes the link
 * (shown as a chip); the brackets and the id are never typed.
 *
 * **`/` at the start of a line** opens what a line can be - a heading, a list,
 * a step to tick, a quote, a divider, a link - and whatever else the screen
 * adds: the journal adds what you did today and a question to write to.
 */

export type SlashExtra = { label: string; detail: string; text: () => string };

/** Beside each name: its section, or what else is known of it - a contact's city, a person's role. */
function describe(target: LinkTarget): string {
  if (target.kind === "page") return isSection(target.detail) ? sectionOf(target.detail).label : "Page";
  const kind = { contact: "Contact", product: "Product", person: "Person", document: "Document" }[target.kind];
  return target.detail ? `${kind} · ${target.detail}` : kind;
}

/** The colour of a target's dot on the Map, for its row in the list. */
const dots = new WeakMap<Completion, string>();

function linkSource(companyId: () => string, exclude: () => string) {
  return async (context: CompletionContext): Promise<CompletionResult | null> => {
    // `[[` anywhere, `@` only at the start of a word - an email address is not a mention.
    const typed = context.matchBefore(/(?:\[\[|(?:^|[\s(])@)[^\]\n|@[]{0,40}$/);
    if (!typed) return null;
    const bracket = typed.text.indexOf("[[");
    const start = bracket !== -1 ? typed.from + bracket : typed.from + typed.text.indexOf("@");
    const query = context.state.sliceDoc(start, context.pos).replace(/^(\[\[|@)/, "");
    // A mention that has run on into a sentence is not one any more.
    if (query.length > 0 && /\s{2}|[.!?,;]$/.test(query)) return null;

    const found = await window.caulder.brain.linkTargets(companyId(), query).catch(() => [] as LinkTarget[]);
    if (context.aborted) return null;
    const options = found
      .filter((target) => !(target.kind === "page" && target.id === exclude()))
      .map((target): Completion => {
        const option: Completion = {
          label: target.name,
          detail: describe(target),
          // The chip, and the cursor after it - no space added, since the next thing typed is usually one.
          apply: (view: EditorView, _completion: Completion, from: number, to: number) => {
            const token = linkToken(target.name, target);
            view.dispatch({
              changes: { from, to, insert: token },
              selection: { anchor: from + token.length },
              userEvent: "input.complete",
            });
          },
        };
        dots.set(option, mapKindOf(target.kind, target.kind === "page" && isSection(target.detail) ? target.detail : null));
        return option;
      });
    return { from: start, to: context.pos, options, filter: false };
  };
}

type Slash = { label: string; detail: string; icon: string; run: (view: EditorView, from: number, to: number) => void };

/** The line becomes `prefix` plus whatever was on it after the slash. */
const line = (prefix: string) => (view: EditorView, from: number, to: number) =>
  view.dispatch({ changes: { from, to, insert: prefix }, selection: { anchor: from + prefix.length }, userEvent: "input.complete" });

const LINE_KINDS: Slash[] = [
  { label: "Heading", detail: "A title for a part", icon: "H", run: line("## ") },
  { label: "Small heading", detail: "Under a heading", icon: "h", run: line("### ") },
  { label: "Bullets", detail: "A list", icon: "•", run: line("- ") },
  { label: "Numbered", detail: "A list in order", icon: "1.", run: line("1. ") },
  { label: "Checklist", detail: "Steps to tick", icon: "☐", run: line("- [ ] ") },
  { label: "Quote", detail: "Words someone said", icon: "❝", run: line("> ") },
  {
    label: "Divider",
    detail: "A line across",
    icon: "—",
    run: (view, from, to) => view.dispatch({ changes: { from, to, insert: "---\n" }, selection: { anchor: from + 4 } }),
  },
  {
    label: "Link",
    detail: "A page, contact or person",
    icon: "@",
    run: (view, from, to) => {
      view.dispatch({ changes: { from, to, insert: "@" }, selection: { anchor: from + 1 } });
      startCompletion(view);
    },
  },
];

function slashSource(extras: () => readonly SlashExtra[]) {
  return (context: CompletionContext): CompletionResult | null => {
    const line = context.state.doc.lineAt(context.pos);
    const before = context.state.sliceDoc(line.from, context.pos);
    const typed = /^(\s*)\/([\p{L} ]{0,24})$/u.exec(before);
    if (!typed) return null;
    const from = line.from + (typed[1]?.length ?? 0);
    const all: Slash[] = [
      ...LINE_KINDS,
      ...extras().map(
        (extra): Slash => ({
          label: extra.label,
          detail: extra.detail,
          icon: "✦",
          run: (view, start, end) => {
            const text = extra.text();
            view.dispatch({ changes: { from: start, to: end, insert: text }, selection: { anchor: start + text.length } });
          },
        }),
      ),
    ];
    return {
      from,
      to: context.pos,
      filter: true,
      options: all.map(
        (slash, index): Completion & { icon: string } => ({
          // Matched against what follows the slash; shown without it.
          label: `/${slash.label}`,
          displayLabel: slash.label,
          detail: slash.detail,
          icon: slash.icon,
          // In the order written here - what a line can be, then what the screen adds - not by the alphabet.
          boost: 90 - index,
          apply: (view: EditorView, _completion: Completion, start: number, end: number) => slash.run(view, start, end),
        }),
      ),
    };
  };
}

/** The lists, in one: whichever the text before the cursor asks for. */
export function writingCompletions(options: {
  companyId: () => string;
  exclude: () => string;
  extras: () => readonly SlashExtra[];
}) {
  return autocompletion({
    override: [linkSource(options.companyId, options.exclude), slashSource(options.extras)],
    icons: false,
    activateOnTyping: true,
    closeOnBlur: true,
    // The list only ever opens because it was asked for - @, [[, / - so Enter as it appears means it.
    // The usual pause after each refresh made a quick Enter a new line, and left the link unmade.
    interactionDelay: 0,
    maxRenderedOptions: 12,
    addToOptions: [
      {
        position: 20,
        render: (completion) => {
          const mark = document.createElement("span");
          const dot = dots.get(completion);
          if (dot) {
            mark.className = `mapdot mapdot--${dot}`;
          } else {
            mark.className = "cm-slashicon";
            mark.textContent = (completion as Completion & { icon?: string }).icon ?? "";
          }
          mark.setAttribute("aria-hidden", "true");
          return mark;
        },
      },
    ],
  });
}
