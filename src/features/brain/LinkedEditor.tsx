import { useEffect, useRef, useState, type ReactNode } from "react";
import { Bold, Heading2, Italic, Link2, List, ListChecks } from "lucide-react";
import { acceptCompletion, startCompletion } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown, markdownKeymap, markdownLanguage } from "@codemirror/lang-markdown";
import { Annotation, Compartment, EditorState, Transaction } from "@codemirror/state";
import { EditorView, keymap, placeholder as placeholderText } from "@codemirror/view";
import { unfinishedLinks, type LinkRef, type LinkedName } from "@shared/links";
import { linkAt, livePreview, setLinkNames } from "./editor/livePreview";
import { writingCompletions, type SlashExtra } from "./editor/completions";
import { setLinePrefix, startLink, toggleWrap } from "./editor/commands";

/**
 * Where a page is written, and the journal: text that looks like what it will
 * be while it is typed (editor/livePreview.ts), links made with `@` or `[[`
 * and shown as chips, `/` for what a line can be (editor/completions.ts), and
 * a small bar over any words selected - bold, italic, heading, list, steps,
 * link - for the mouse. Ctrl+B, Ctrl+I and Ctrl+K do the same from the keys.
 *
 * What is kept is still the page's markdown, character for character: the
 * editor only changes how it looks while it is written.
 *
 * CodeMirror keeps its own copy of the text; `value` is sent in only when it
 * changes from outside - another day opened, a version put back - and never
 * echoes a change the editor itself made.
 */

/** A change sent in from outside, which is not the person typing and is not undone by Ctrl+Z. */
const fromOutside = Annotation.define<boolean>();

/** The editor's own look, in the app's colours; the marks it draws are styled in brain.css. */
const look = EditorView.theme({
  "&": {
    color: "var(--ink)",
    backgroundColor: "var(--surface)",
    border: "1px solid var(--border-input)",
    borderRadius: "var(--radius-md)",
    fontSize: "var(--text-base)",
  },
  "&.cm-focused": {
    outline: "none",
    borderColor: "var(--accent)",
    boxShadow: "0 0 0 3px color-mix(in srgb, var(--accent) 20%, transparent)",
  },
  ".cm-scroller": { fontFamily: "inherit", lineHeight: "1.7" },
  ".cm-content": { padding: "12px 16px", caretColor: "var(--ink)", minHeight: "var(--liveedit-min, 7em)" },
  ".cm-line": { padding: "0" },
  ".cm-placeholder": { color: "var(--ink-3)" },
  ".cm-tooltip": {
    border: "1px solid var(--border-strong)",
    backgroundColor: "var(--surface)",
    color: "var(--ink)",
    borderRadius: "var(--radius-md)",
    boxShadow: "var(--shadow-lg)",
    overflow: "hidden",
  },
  ".cm-tooltip.cm-tooltip-autocomplete > ul": { fontFamily: "inherit", maxHeight: "20em", minWidth: "260px", padding: "4px" },
  ".cm-tooltip.cm-tooltip-autocomplete > ul > li": {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "6px 10px",
    borderRadius: "var(--radius-sm)",
    lineHeight: "1.4",
  },
  ".cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]": {
    backgroundColor: "var(--accent-soft)",
    color: "var(--ink)",
  },
  ".cm-completionLabel": { fontWeight: "600" },
  ".cm-completionDetail": {
    marginLeft: "auto",
    paddingLeft: "12px",
    fontStyle: "normal",
    color: "var(--ink-3)",
    fontSize: "var(--text-xs)",
  },
  ".cm-completionMatchedText": { textDecoration: "none", color: "var(--accent-strong)" },
});

type Bar = { top: number; left: number };

export function LinkedEditor({
  label,
  companyId,
  exclude,
  value,
  disabled = false,
  onChange,
  className = "",
  placeholder,
  names,
  onOpenLink,
  extras,
  hint,
  autoFocus = false,
}: {
  /** What a screen reader calls it; the tests find it by this too. */
  label: string;
  companyId: string;
  /** This page, which cannot link to itself. */
  exclude: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  /** The current names of what the text links to, for its chips. */
  names?: Readonly<Record<string, LinkedName>>;
  /** Ctrl+click on a chip. */
  onOpenLink?: (ref: LinkRef) => void;
  /** More for the `/` list, from the screen the editor is on. */
  extras?: readonly SlashExtra[];
  /** Under the editor. Left out, it says how to link and format; null says nothing. */
  hint?: ReactNode | null;
  autoFocus?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const editable = useRef(new Compartment());
  const [bar, setBar] = useState<Bar | null>(null);

  // What the editor's listeners read, kept current without rebuilding it.
  const latest = useRef({ onChange, companyId, exclude, extras: extras ?? [], onOpenLink });
  latest.current = { onChange, companyId, exclude, extras: extras ?? [], onOpenLink };

  useEffect(() => {
    const parent = host.current;
    if (!parent) return;

    /** The bar over a selection: centred over where it starts, measured when the editor allows it. */
    const placeBar = (editor: EditorView) => {
      const selection = editor.state.selection.main;
      if (selection.empty || !editor.hasFocus) {
        setBar(null);
        return;
      }
      editor.requestMeasure({
        read: () => {
          const start = editor.coordsAtPos(selection.from);
          const end = editor.coordsAtPos(selection.to);
          const frame = box.current?.getBoundingClientRect();
          if (!start || !frame) return null;
          const sameLine = end && Math.abs(end.top - start.top) < 4;
          const left = sameLine && end ? (start.left + end.left) / 2 : start.left;
          return { top: start.top - frame.top, left: Math.max(90, Math.min(left - frame.left, frame.width - 90)) };
        },
        write: (placed) => setBar(placed),
      });
    };

    const made = new EditorView({
      parent,
      state: EditorState.create({
        doc: value,
        extensions: [
          look,
          history(),
          EditorView.lineWrapping,
          markdown({ base: markdownLanguage, addKeymap: false }),
          livePreview(),
          writingCompletions({
            companyId: () => latest.current.companyId,
            exclude: () => latest.current.exclude,
            extras: () => latest.current.extras,
          }),
          keymap.of([
            { key: "Tab", run: acceptCompletion },
            { key: "Mod-b", run: (editor) => toggleWrap(editor, "**") },
            { key: "Mod-i", run: (editor) => toggleWrap(editor, "*") },
            { key: "Mod-k", run: startLink },
            ...markdownKeymap,
            ...historyKeymap,
            ...defaultKeymap,
          ]),
          placeholder ? placeholderText(placeholder) : [],
          editable.current.of(EditorView.editable.of(!disabled)),
          // The list that opens is suggestions of every kind - links, and what a line can be.
          EditorState.phrases.of({ Completions: "Suggestions" }),
          EditorView.contentAttributes.of({ "aria-label": label, "aria-multiline": "true", spellcheck: "true" }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !update.transactions.every((transaction) => transaction.annotation(fromOutside))) {
              latest.current.onChange(update.state.doc.toString());
            }
            if (update.selectionSet || update.focusChanged || update.docChanged || update.geometryChanged) {
              placeBar(update.view);
            }
          }),
          EditorView.domEventHandlers({
            // A link begun and never finished: a click puts the cursor after its words and opens the list.
            click: (event, editor) => {
              const target = event.target instanceof HTMLElement ? event.target.closest(".cm-unlinked") : null;
              if (!target) return false;
              const line = editor.state.doc.lineAt(editor.posAtDOM(target));
              const at = editor.posAtDOM(target) - line.from;
              const found = unfinishedLinks(line.text).find((each) => each.start <= at && at <= each.end);
              if (!found) return false;
              // To the end of the words, and without a closing ]] the list would stop at.
              const closed = line.text.slice(found.end - 2, found.end) === "]]";
              const end = line.from + (closed ? found.end - 2 : found.end);
              editor.dispatch({
                changes: closed ? { from: end, to: end + 2 } : [],
                selection: { anchor: end },
              });
              startCompletion(editor);
              return true;
            },
            mousedown: (event) => {
              if (!(event.ctrlKey || event.metaKey)) return false;
              const ref = linkAt(event.target);
              if (!ref || !latest.current.onOpenLink) return false;
              event.preventDefault();
              latest.current.onOpenLink(ref);
              return true;
            },
          }),
        ],
      }),
    });
    view.current = made;
    if (autoFocus) made.focus();
    return () => {
      made.destroy();
      view.current = null;
    };
    // Made once: what changes afterwards is sent in by the effects below.
  }, []);

  // A change from outside - another day, a version put back - replaces the text without echoing back.
  useEffect(() => {
    const editor = view.current;
    if (!editor) return;
    const current = editor.state.doc.toString();
    if (current === value) return;
    editor.dispatch({
      changes: { from: 0, to: current.length, insert: value },
      annotations: [fromOutside.of(true), Transaction.addToHistory.of(false)],
    });
  }, [value]);

  useEffect(() => {
    view.current?.dispatch({ effects: editable.current.reconfigure(EditorView.editable.of(!disabled)) });
  }, [disabled]);

  useEffect(() => {
    view.current?.dispatch({ effects: setLinkNames.of(names ?? {}) });
  }, [names]);

  /** A button on the bar: acts on the editor without taking its focus, so the selection stays. */
  const tool = (name: string, keys: string | null, icon: ReactNode, run: (editor: EditorView) => boolean) => (
    <button
      type="button"
      className="liveedit__tool"
      tabIndex={-1}
      aria-label={name}
      title={keys ? `${name} (${keys})` : name}
      onMouseDown={(event) => {
        event.preventDefault();
        if (view.current) run(view.current);
      }}
    >
      {icon}
    </button>
  );

  return (
    <div className={`liveedit ${className}`} ref={box}>
      <div ref={host} />
      {bar && (
        <div className="liveedit__bar anim-menu" role="toolbar" aria-label="Format" style={{ top: bar.top, left: bar.left }}>
          {tool("Bold", "Ctrl+B", <Bold size={15} aria-hidden />, (editor) => toggleWrap(editor, "**"))}
          {tool("Italic", "Ctrl+I", <Italic size={15} aria-hidden />, (editor) => toggleWrap(editor, "*"))}
          {tool("Heading", null, <Heading2 size={15} aria-hidden />, (editor) => setLinePrefix(editor, "## "))}
          {tool("Bullets", null, <List size={15} aria-hidden />, (editor) => setLinePrefix(editor, "- "))}
          {tool("Steps to tick", null, <ListChecks size={15} aria-hidden />, (editor) => setLinePrefix(editor, "- [ ] "))}
          <span className="liveedit__sep" aria-hidden />
          {tool("Link", "Ctrl+K", <Link2 size={15} aria-hidden />, startLink)}
        </div>
      )}
      {hint !== null && (
        <p className="liveedit__hint">
          {hint ?? (
            <>
              <kbd>@</kbd> links a page or contact · <kbd>/</kbd> for headings, lists and steps · select words to format
              them
            </>
          )}
        </p>
      )}
    </div>
  );
}
