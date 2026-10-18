import { useEffect, useMemo, useState } from "react";
import { MessageCircleQuestion, RotateCcw, Sparkles } from "lucide-react";
import { linkAnswer, serviceOf, type AskAnswer, type AskPreview, type AskState, type AskTurn } from "@shared/ask";
import { sayParts, tokensIn } from "@shared/relevant";
import type { LinkedName } from "@shared/links";
import { Card } from "@/components/Card";
import { ErrorLine } from "@/components/ErrorLine";
import { messageOf } from "@/lib/errors";
import { Markdown } from "./Markdown";
import { numberText } from "@/lib/format";

type Exchange = { question: string; answer: AskAnswer | null; error: string | null };

const EXAMPLES = [
  "Which deals should I chase this week?",
  "How long does the money last?",
  "What do customers object to on calls?",
];

/**
 * Ask the brain, on Brain home.
 *
 * A conversation for as long as the page is open: each question goes with the
 * ones before it, so "and the ones in Mysuru?" means something. Answers link
 * to the pages and contacts they drew on, and say what was sent.
 *
 * What goes with a question is what it needs (shared/relevant.ts), and is
 * said under the box before it is sent. An answer that needed more can be
 * asked for again with the whole company.
 */
export function AskBox({
  companyId,
  onOpenPage,
  onOpenContact,
}: {
  companyId: string;
  onOpenPage: (pageId: string) => void;
  onOpenContact: (leadId: string) => void;
}) {
  const [state, setState] = useState<AskState | null>(null);
  const [question, setQuestion] = useState("");
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** What would go with the question as typed, worked out on this machine. Keyed by the question it is for. */
  const [preview, setPreview] = useState<{ key: string; what: AskPreview } | null>(null);

  useEffect(() => {
    window.caulder.ask
      .state()
      .then(setState)
      .catch((cause: unknown) => setError(messageOf(cause)));
  }, []);

  const history: AskTurn[] = useMemo(
    () =>
      exchanges.flatMap((exchange) =>
        exchange.answer
          ? [
              { role: "user" as const, text: exchange.question },
              { role: "assistant" as const, text: exchange.answer.text },
            ]
          : [],
      ),
    [exchanges],
  );

  // Said before it is sent: once the typing pauses, what this question would take with it.
  const typed = question.trim();
  const connected = state?.connected === true;
  useEffect(() => {
    if (!connected || typed.length < 4) return;
    const timer = setTimeout(() => {
      window.caulder.ask.preview(companyId, { question: typed, history: history.slice(-20) }).then(
        (what) => setPreview({ key: typed, what }),
        () => undefined,
      );
    }, 350);
    return () => clearTimeout(timer);
  }, [connected, typed, companyId, history]);
  const going = preview && preview.key === typed ? preview.what : null;

  async function ask(text: string, whole = false) {
    const asked = text.trim();
    if (asked.length === 0 || busy) return;
    setBusy(true);
    setQuestion("");
    setExchanges((current) => [...current, { question: asked, answer: null, error: null }]);
    try {
      const answer = await window.caulder.ask.question(companyId, { question: asked, history: history.slice(-20), whole });
      setExchanges((current) => current.map((exchange, at) => (at === current.length - 1 ? { ...exchange, answer } : exchange)));
    } catch (cause) {
      const message = messageOf(cause);
      setExchanges((current) =>
        current.map((exchange, at) => (at === current.length - 1 ? { ...exchange, error: message } : exchange)),
      );
    } finally {
      setBusy(false);
    }
  }

  if (!state) return <ErrorLine>{error}</ErrorLine>;

  // Nothing connected: nothing here. Connecting one is offered once, in Finish setting up on Today, and in Settings.
  if (!state.connected) return null;

  const model =
    state.models.find((option) => option.id === state.model)?.label ??
    state.model ??
    serviceOf(state.service)?.label ??
    "The AI";

  return (
    <Card
      title="Ask the brain"
      icon={<Sparkles size={15} aria-hidden />}
      actions={
        exchanges.length > 0 && (
          <button type="button" className="btn btn--sm btn--ghost" onClick={() => setExchanges([])} disabled={busy}>
            <RotateCcw size={13} aria-hidden />
            Start over
          </button>
        )
      }
    >
      {exchanges.length > 0 && (
        <ol className="ask__thread" aria-label="Questions and answers">
          {exchanges.map((exchange, index) => (
            <li key={index} className="ask__exchange">
              <p className="ask__question">
                <MessageCircleQuestion size={14} aria-hidden />
                {exchange.question}
              </p>
              {exchange.answer ? (
                <Answer
                  answer={exchange.answer}
                  onOpenPage={onOpenPage}
                  onOpenContact={onOpenContact}
                  onAskWhole={busy ? null : () => void ask(exchange.question, true)}
                />
              ) : exchange.error ? (
                <ErrorLine>{exchange.error}</ErrorLine>
              ) : (
                <p className="ask__thinking" role="status">
                  {model} is reading…
                </p>
              )}
            </li>
          ))}
        </ol>
      )}

      <form
        className="ask__form"
        onSubmit={(event) => {
          event.preventDefault();
          void ask(question);
        }}
      >
        <textarea
          className="textarea ask__input"
          value={question}
          rows={2}
          maxLength={4000}
          aria-label="Ask the brain"
          placeholder={exchanges.length > 0 ? "Ask a follow-up" : "Ask anything about the company"}
          disabled={busy}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void ask(question);
            }
          }}
        />
        <button type="submit" className="btn btn--primary" disabled={busy || question.trim() === ""}>
          Ask
        </button>
      </form>

      {going && (
        <p className="card__hint ask__going" role="status">
          Sending: {sayParts(going.parts)} - about {numberText(tokensIn(going.characters))} tokens.
        </p>
      )}

      {exchanges.length === 0 && (
        <div className="chips ask__examples">
          {EXAMPLES.map((example) => (
            <button key={example} type="button" className="chip" onClick={() => void ask(example)} disabled={busy}>
              {example}
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}

function Answer({
  answer,
  onOpenPage,
  onOpenContact,
  onAskWhole,
}: {
  answer: AskAnswer;
  onOpenPage: (pageId: string) => void;
  onOpenContact: (leadId: string) => void;
  /** Ask the same again with the whole company. Null while something is being asked. */
  onAskWhole: (() => void) | null;
}) {
  const source = useMemo(() => linkAnswer(answer.text, answer.references), [answer]);
  const links = useMemo(() => {
    const names: Record<string, LinkedName> = {};
    for (const reference of answer.references) {
      names[`${reference.kind}:${reference.id}`] = { name: reference.name, kind: reference.kind };
    }
    return names;
  }, [answer]);
  const { sent } = answer;

  return (
    <div className="ask__answer anim-spring">
      <Markdown
        source={source}
        links={links}
        onOpenLink={(ref) => (ref.kind === "page" ? onOpenPage(ref.id) : onOpenContact(ref.id))}
      />
      <details className="ask__sent">
        <summary>What was sent</summary>
        <p>
          To {answer.service} ({answer.model}): the question, the conversation before it, and{" "}
          {sayParts(sent.parts, 12)} - {numberText(sent.characters)} characters, numbers masked.{" "}
          {sent.whole
            ? sent.leftOut > 0
              ? `${sent.contacts} contacts in full; ${sent.leftOut} left out to fit, chosen by the question.`
              : `All ${sent.contacts} contacts.`
            : sent.contacts === 0
              ? "No contact's details."
              : `${sent.contacts} of ${sent.contacts + sent.leftOut} contacts, the ones the question is about.`}{" "}
          {numberText(answer.usage.input)} tokens in
          {answer.usage.cached > 0 ? ` (${numberText(answer.usage.cached)} from the cache)` : ""},{" "}
          {numberText(answer.usage.output)} out.
        </p>
        {!sent.whole && onAskWhole && (
          <p>
            <button type="button" className="linkbtn" onClick={onAskWhole}>
              Ask again with the whole company
            </button>
          </p>
        )}
      </details>
    </div>
  );
}
