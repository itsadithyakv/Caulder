import { useEffect, useMemo, useState } from "react";
import { MessageCircleQuestion, RotateCcw, Sparkles } from "lucide-react";
import { linkAnswer, serviceOf, type AskAnswer, type AskState, type AskTurn } from "@shared/ask";
import type { LinkedName } from "@shared/links";
import { Card } from "@/components/Card";
import { ErrorLine } from "@/components/ErrorLine";
import { messageOf } from "@/lib/errors";
import { Markdown } from "./Markdown";

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
 */
export function AskBox({
  companyId,
  onOpenPage,
  onOpenContact,
  onGoToSettings,
}: {
  companyId: string;
  onOpenPage: (pageId: string) => void;
  onOpenContact: (leadId: string) => void;
  onGoToSettings: () => void;
}) {
  const [state, setState] = useState<AskState | null>(null);
  const [question, setQuestion] = useState("");
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    window.caulder.ask
      .state()
      .then(setState)
      .catch((cause: unknown) => setError(messageOf(cause)));
  }, []);

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
      const answer = await window.caulder.ask.question(companyId, { question: asked, history: history.slice(-20) });
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

  if (!state.connected) {
    // One line until an AI is connected: the offer, and the way to take it up.
    return (
      <section className="card askoff">
        <Sparkles size={16} className="askoff__icon" aria-hidden />
        <p className="askoff__text">
          Ask anything about the company - deals to chase, how long the money lasts - once an AI is connected. Gemini is
          free.
        </p>
        <button type="button" className="btn btn--sm" onClick={onGoToSettings}>
          Connect an AI in Settings
        </button>
      </section>
    );
  }

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
                <Answer answer={exchange.answer} onOpenPage={onOpenPage} onOpenContact={onOpenContact} />
              ) : exchange.error ? (
                <ErrorLine>{exchange.error}</ErrorLine>
              ) : (
                <p className="ask__thinking" role="status">
                  {model} is reading the company…
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
          {sent.documents.length} documents (
          {sent.documents.join(", ")}) - {sent.characters.toLocaleString()} characters, numbers masked.{" "}
          {sent.leftOut > 0
            ? `${sent.contacts} contacts in full; ${sent.leftOut} left out to fit, chosen by the question.`
            : `All ${sent.contacts} contacts.`}{" "}
          {answer.usage.input.toLocaleString()} tokens in
          {answer.usage.cached > 0 ? ` (${answer.usage.cached.toLocaleString()} from the cache)` : ""},{" "}
          {answer.usage.output.toLocaleString()} out.
        </p>
      </details>
    </div>
  );
}
