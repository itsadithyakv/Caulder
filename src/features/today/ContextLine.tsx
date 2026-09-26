import { useEffect, useRef, useState } from "react";
import { ClipboardCheck, CornerDownLeft } from "lucide-react";
import { modeInfo, type LineMode } from "@shared/ember";
import type { TopicCopied } from "@shared/topic";
import { messageOf } from "@/lib/errors";
import { ErrorLine } from "@/components/ErrorLine";
import { useEmberMood } from "@/components/Ember";
import { LineModes } from "./LineModes";
import { numberText } from "@/lib/format";

/**
 * The same line again, in its third mode: a topic in, and everything Caulder
 * knows about it on the clipboard, ready to paste into any AI.
 *
 * It wears the quick line's own classes, like AskLine does, because it is
 * the same control in another mode rather than a third control that looks
 * similar.
 *
 * What comes back is a receipt, not the text. The words themselves never
 * reach this window - main puts them on the clipboard - so what is shown is
 * how big it is and what went into it. That is also the honest thing to
 * show: somebody about to paste their journal into a chat window should see
 * the size of what they are pasting before they paste it, not after.
 */
export function ContextLine({
  companyId,
  writing,
  focusNonce = 0,
  onMode,
}: {
  companyId: string;
  writing: LineMode;
  focusNonce?: number;
  onMode: (mode: LineMode) => void;
}) {
  const [topic, setTopic] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<TopicCopied | null>(null);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    input.current?.focus();
  }, [focusNonce]);

  const mood = useEmberMood({ busy, failed: error !== null, done: copied !== null });

  async function copy(text: string) {
    const asked = text.trim();
    if (asked.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    setCopied(null);
    try {
      setCopied(await window.caulder.brain.topic(companyId, asked));
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="quickadd askline">
      <div className="quickadd__row">
        <LineModes mode="copy" writing={writing} mood={mood} canAsk onMode={onMode} />
        <input
          ref={input}
          className="quickadd__input"
          value={topic}
          placeholder={modeInfo("copy").placeholder}
          aria-label="A topic to copy context for"
          autoComplete="off"
          disabled={busy}
          onChange={(event) => setTopic(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape" && topic.length > 0) {
              event.preventDefault();
              event.stopPropagation();
              setTopic("");
              return;
            }
            if (event.key !== "Enter") return;
            event.preventDefault();
            void copy(topic);
          }}
        />
        <button
          type="button"
          className="btn btn--sm btn--primary quickadd__go"
          disabled={busy || topic.trim() === ""}
          onClick={() => void copy(topic)}
        >
          <CornerDownLeft size={14} aria-hidden />
          {busy ? "Gathering" : "Copy"}
        </button>
      </div>

      {error && <ErrorLine>{error}</ErrorLine>}

      {copied ? (
        <div className="quickadd__read" role="status">
          <span className="quickadd__kept">
            <ClipboardCheck size={14} aria-hidden />
            <strong>{copied.topic}</strong> copied &mdash; {numberText(copied.chars)} characters
            {copied.went.length > 0 ? `: ${copied.went.join(", ")}` : ", and Caulder holds no record of it"}.
            {copied.cut ? " It did not all fit; the longest pages say where they were cut." : ""} Paste it into any
            AI. Locked journal days and anything you marked private were left out, and the paste says so at its
            foot.
          </span>
        </div>
      ) : (
        <div className="quickadd__read">
          <span className="quickadd__hint">
            Not a search: the pages under a page come too, so a topic brings its whole branch. Try a hobby, a
            company, a subject or a person.
          </span>
        </div>
      )}
    </div>
  );
}
