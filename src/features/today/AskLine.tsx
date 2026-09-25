import { useEffect, useMemo, useRef, useState } from "react";
import { CornerDownLeft, RotateCcw } from "lucide-react";
import { linkAnswer, type AskAnswer, type AskTurn } from "@shared/ask";
import type { LinkedName } from "@shared/links";
import { messageOf } from "@/lib/errors";
import { ErrorLine } from "@/components/ErrorLine";
import { useEmberMood } from "@/components/Ember";
import { Markdown } from "@/features/brain/Markdown";
import { modeInfo, type LineMode } from "@shared/ember";
import { LineModes } from "./LineModes";

/**
 * The same line on Today, asked of your AI instead of read by Caulder.
 *
 * One line does both, because two lines on one screen is a choice nobody
 * wants to make twice a minute. The star switches between them: grey and
 * Caulder reads the line itself - a task, a journal line, time on a hobby -
 * coloured and the line is a question, answered by whichever AI is connected.
 *
 * It wears the quick line's own classes on purpose. It is not a second
 * control that looks similar; it is the same control in its other mode, and
 * anything that made them drift apart would be felt as the line moving under
 * the cursor.
 *
 * What goes with a question is small and chosen: today, whatever the words
 * point at, and - only if it has been allowed in Settings - your own pages.
 * Never a locked or private journal day. The answer says what went.
 */

const EXAMPLES = [
  "What should I do first today?",
  "How am I doing on my goals?",
  "What did I say I would do about the invoice?",
];

type Exchange = { question: string; answer: AskAnswer | null; error: string | null };

export function AskLine({
  companyId,
  focusNonce = 0,
  model,
  writing,
  onMode,
  onOpenPage,
  onOpenContact,
}: {
  companyId: string;
  /** Bumped from outside - the A key - to put the cursor here. */
  focusNonce?: number;
  /** Who is answering, for the line while it thinks. */
  model: string;
  /** Which writing flame this workspace has, for when the line goes back to it. */
  writing: LineMode;
  /** Somewhere else: back to the line Caulder reads, or on to copying context. */
  onMode: (mode: LineMode) => void;
  onOpenPage: (pageId: string) => void;
  onOpenContact: (leadId: string) => void;
}) {
  const [question, setQuestion] = useState("");
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const last = exchanges.at(-1);
  const mood = useEmberMood({ busy, failed: last?.error != null, done: last?.answer != null });

  useEffect(() => {
    input.current?.focus();
  }, [focusNonce]);

  async function ask(text: string) {
    const asked = text.trim();
    if (asked.length === 0 || busy) return;
    const history: AskTurn[] = exchanges.flatMap((exchange) =>
      exchange.answer
        ? [
            { role: "user" as const, text: exchange.question },
            { role: "assistant" as const, text: exchange.answer.text },
          ]
        : [],
    );
    setBusy(true);
    setQuestion("");
    setExchanges((current) => [...current, { question: asked, answer: null, error: null }]);
    try {
      const answer = await window.caulder.ask.question(companyId, {
        question: asked,
        history: history.slice(-8),
        scope: "line",
      });
      setExchanges((current) => current.map((one, at) => (at === current.length - 1 ? { ...one, answer } : one)));
    } catch (cause) {
      const said = messageOf(cause);
      setExchanges((current) => current.map((one, at) => (at === current.length - 1 ? { ...one, error: said } : one)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="quickadd askline">
      <div className="quickadd__row">
        <LineModes mode="ask" writing={writing} mood={mood} canAsk onMode={onMode} />
        <input
          ref={input}
          className="quickadd__input"
          value={question}
          placeholder={modeInfo("ask").placeholder}
          aria-label="Ask the AI"
          autoComplete="off"
          disabled={busy}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape" && question.length > 0) {
              event.preventDefault();
              event.stopPropagation();
              setQuestion("");
              return;
            }
            if (event.key !== "Enter") return;
            event.preventDefault();
            void ask(question);
          }}
        />
        <button
          type="button"
          className="btn btn--sm btn--primary quickadd__go"
          disabled={busy || question.trim() === ""}
          onClick={() => void ask(question)}
        >
          <CornerDownLeft size={14} aria-hidden />
          Ask
        </button>
      </div>

      {exchanges.length === 0 ? (
        <div className="quickadd__read">
          <span className="quickadd__hint">
            Today, and whatever the question is about, goes with it. Press the star to go back to adding things.
          </span>
        </div>
      ) : (
        <ol className="askline__thread" aria-label="Questions and answers" aria-live="polite">
          {exchanges.slice(-4).map((exchange, index) => (
            <li key={index} className="askline__turn">
              <p className="askline__question">{exchange.question}</p>
              {exchange.answer ? (
                <Answer answer={exchange.answer} onOpenPage={onOpenPage} onOpenContact={onOpenContact} />
              ) : exchange.error ? (
                <ErrorLine>{exchange.error}</ErrorLine>
              ) : (
                <p className="askline__thinking" role="status">
                  {model} is reading&hellip;
                </p>
              )}
            </li>
          ))}
        </ol>
      )}

      {exchanges.length === 0 ? (
        <div className="chips askline__examples">
          {EXAMPLES.map((example) => (
            <button key={example} type="button" className="chip" disabled={busy} onClick={() => void ask(example)}>
              {example}
            </button>
          ))}
        </div>
      ) : (
        <div className="askline__foot">
          <button type="button" className="btn btn--sm btn--ghost" disabled={busy} onClick={() => setExchanges([])}>
            <RotateCcw size={13} aria-hidden />
            Start over
          </button>
        </div>
      )}
    </div>
  );
}

function Answer({
  answer,
  onOpenPage,
  onOpenContact,
}: {
  answer: AskAnswer;
  onOpenPage: (pageId: string) => void;
  onOpenContact: (leadId: string) => void;
}) {
  const source = useMemo(() => linkAnswer(answer.text, answer.references), [answer]);
  const links = useMemo(() => {
    const names: Record<string, LinkedName> = {};
    for (const reference of answer.references) {
      names[`${reference.kind}:${reference.id}`] = { name: reference.name, kind: reference.kind };
    }
    return names;
  }, [answer]);

  return (
    <div className="askline__answer anim-spring">
      <Markdown
        source={source}
        links={links}
        onOpenLink={(ref) => (ref.kind === "page" ? onOpenPage(ref.id) : onOpenContact(ref.id))}
      />
      <details className="ask__sent">
        <summary>What was sent</summary>
        <p>
          To {answer.service} ({answer.model}): the question and {answer.sent.documents.length} documents (
          {answer.sent.documents.join(", ")}) &mdash; {answer.sent.characters.toLocaleString()} characters, numbers
          masked.{" "}
          {answer.sent.personal
            ? "Your own pages went too, which you allowed in Settings. Locked and private journal days never do."
            : "None of your own pages went; Settings can allow that."}{" "}
          {answer.usage.input.toLocaleString()} tokens in, {answer.usage.output.toLocaleString()} out.
        </p>
      </details>
    </div>
  );
}
