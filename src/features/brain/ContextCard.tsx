import { useState } from "react";
import { ClipboardCheck, Copy } from "lucide-react";
import type { TopicCopied } from "@shared/topic";
import { Card } from "@/components/Card";
import { Ember, useEmberMood } from "@/components/Ember";
import { ErrorLine } from "@/components/ErrorLine";
import { messageOf } from "@/lib/errors";
import { numberText } from "@/lib/format";

/**
 * Everything about one topic, for an AI that is not Caulder's.
 *
 * The same thing the violet flame on Today does, where somebody would come
 * looking for it rather than happen upon it. The quick line is for the
 * question you have while standing up; this is for sitting down with a chat
 * window open on the other monitor, which is when you want the examples and
 * the sentence about what does not go.
 *
 * It sits directly under Ask, because they are the two halves of one idea:
 * Ask sends the context to the AI Caulder is connected to, and this hands it
 * to you to send to any other one.
 */
const EXAMPLES = ["everything about our pricing", "guitar", "what I know about exams this term"];

export function ContextCard({ companyId }: { companyId: string }) {
  const [topic, setTopic] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<TopicCopied | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    <Card title="Context for another AI">
      <p className="card__hint">
        Name a topic and everything Caulder holds about it goes on the clipboard, written out in full, ready to
        paste into any chat. Not a search: the pages under a page come with it, so a topic brings its whole branch
        rather than the rows that happen to say the word.
      </p>

      <div className="context__row">
        <span className="context__flame">
          <Ember mode="copy" mood={mood} size={64} listens={false} />
        </span>
        <input
          className="input context__input"
          value={topic}
          placeholder="A topic - a hobby, a company, a subject, a person"
          aria-label="A topic to copy context for"
          autoComplete="off"
          disabled={busy}
          onChange={(event) => setTopic(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            void copy(topic);
          }}
        />
        <button
          type="button"
          className="btn btn--primary"
          disabled={busy || topic.trim() === ""}
          onClick={() => void copy(topic)}
        >
          <Copy size={15} aria-hidden />
          {busy ? "Gathering" : "Copy it"}
        </button>
      </div>

      {error && <ErrorLine>{error}</ErrorLine>}

      {copied ? (
        <p className="card__hint" role="status">
          <ClipboardCheck size={14} aria-hidden /> <strong>{copied.topic}</strong> is on the clipboard &mdash;{" "}
          {numberText(copied.chars)} characters
          {copied.went.length > 0 ? `: ${copied.went.join(", ")}` : ", and Caulder holds no record of it"}.
          {copied.cut ? " It did not all fit; the longest pages say where they were cut." : ""}
        </p>
      ) : (
        <div className="chips">
          {EXAMPLES.map((example) => (
            <button key={example} type="button" className="chip" disabled={busy} onClick={() => void copy(example)}>
              {example}
            </button>
          ))}
        </div>
      )}

      <p className="card__hint">
        A journal day you have locked, and anything you told the line was private, never go - and the paste says so
        at its foot, so whatever reads it knows the record is not complete. Registration and account numbers are
        masked.
      </p>
    </Card>
  );
}
