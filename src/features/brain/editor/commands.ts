import { startCompletion } from "@codemirror/autocomplete";
import { EditorSelection, type ChangeSpec } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

/**
 * Formatting, as the selection bar and the keys do it: every command writes
 * the same markdown a person could type, so what the bar does and what `**`
 * does are the same thing.
 */

/** Bold, italic and the like: wraps the selection in `marker`, or unwraps it if it already is. */
export function toggleWrap(view: EditorView, marker: string): boolean {
  const { state } = view;
  const size = marker.length;
  const change = state.changeByRange((range) => {
    const before = state.sliceDoc(range.from - size, range.from);
    const after = state.sliceDoc(range.to, range.to + size);
    if (before === marker && after === marker) {
      return {
        changes: [
          { from: range.from - size, to: range.from },
          { from: range.to, to: range.to + size },
        ],
        range: EditorSelection.range(range.from - size, range.to - size),
      };
    }
    const inside = state.sliceDoc(range.from, range.to);
    if (inside.length >= size * 2 && inside.startsWith(marker) && inside.endsWith(marker)) {
      return {
        changes: { from: range.from, to: range.to, insert: inside.slice(size, -size) },
        range: EditorSelection.range(range.from, range.to - size * 2),
      };
    }
    return {
      changes: [
        { from: range.from, insert: marker },
        { from: range.to, insert: marker },
      ],
      range: EditorSelection.range(range.from + size, range.to + size),
    };
  });
  view.dispatch(state.update(change, { scrollIntoView: true, userEvent: "input.format" }));
  view.focus();
  return true;
}

/** What a line can begin with, of the things the bar sets. */
const PREFIX = /^(\s*)(#{1,6}\s+|>\s+|[-*+]\s+\[[ xX]\]\s+|[-*+]\s+|\d+[.)]\s+)?/;

/**
 * A heading, a list, a step to tick or a quote: sets what each selected line
 * begins with, or takes it off when every line already has it.
 */
export function setLinePrefix(view: EditorView, prefix: string): boolean {
  const { state } = view;
  const lines = new Map<number, { from: number; text: string }>();
  for (const range of state.selection.ranges) {
    for (let at = range.from; at <= range.to; ) {
      const line = state.doc.lineAt(at);
      lines.set(line.number, { from: line.from, text: line.text });
      at = line.to + 1;
    }
  }
  const all = [...lines.values()];
  const already = all.every((line) => (PREFIX.exec(line.text)?.[2] ?? "") === prefix);
  const changes: ChangeSpec[] = all.map((line) => {
    const found = PREFIX.exec(line.text);
    const indent = found?.[1] ?? "";
    const had = found?.[2] ?? "";
    return { from: line.from + indent.length, to: line.from + indent.length + had.length, insert: already ? "" : prefix };
  });
  view.dispatch({ changes, scrollIntoView: true, userEvent: "input.format" });
  view.focus();
  return true;
}

/**
 * Link: with words selected, the list opens already looking for them; with
 * none, at the cursor, ready for a name.
 */
export function startLink(view: EditorView): boolean {
  const range = view.state.selection.main;
  const words = view.state.sliceDoc(range.from, range.to).replace(/[\]|\n]/g, " ").trim();
  const insert = `[[${words}`;
  view.dispatch({
    changes: { from: range.from, to: range.to, insert },
    selection: { anchor: range.from + insert.length },
    userEvent: "input",
  });
  view.focus();
  startCompletion(view);
  return true;
}
