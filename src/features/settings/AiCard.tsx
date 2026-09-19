import { useEffect, useMemo, useState } from "react";
import { ExternalLink, PlugZap, RefreshCw, Unplug } from "lucide-react";
import {
  AI_SERVICES,
  CONTEXT_HINT,
  CONTEXT_LABEL,
  CONTEXT_SIZES,
  DEFAULT_SERVICE,
  connectInput,
  serviceOf,
  type AiService,
  type AskState,
  type ContextSize,
} from "@shared/ask";
import { Card } from "@/components/Card";
import { Chips, Select } from "@/components/Select";
import { ErrorLine } from "@/components/ErrorLine";
import { Markdown } from "@/features/brain/Markdown";
import { messageOf } from "@/lib/errors";

/** A service's steps as a numbered list, with their bold and italics. */
function Steps({ service }: { service: AiService }) {
  const source = useMemo(() => service.steps.map((step, index) => `${index + 1}. ${step}`).join("\n"), [service]);
  return (
    <div className="aicard__steps">
      <Markdown source={source} />
    </div>
  );
}

/**
 * Ask the brain: which AI answers, and how to connect it.
 *
 * Any service will do. Google's Gemini is first because it is free with a
 * Google account; a paid key for a frontier model works the same way, and so
 * does a model running on this computer. Each service says, in order, how to
 * get it connected, and plainly what happens to what is sent - which matters,
 * because what is sent includes contacts.
 */
export function AiCard({ title = "Ask the brain: connect an AI" }: { title?: string }) {
  const [state, setState] = useState<AskState | null>(null);
  const [chosen, setChosen] = useState<string>(DEFAULT_SERVICE);
  const [key, setKey] = useState("");
  const [address, setAddress] = useState("");
  const [typedModel, setTypedModel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    window.caulder.ask
      .state()
      .then(setState)
      .catch((cause: unknown) => setError(messageOf(cause)));
  }, []);

  async function run(work: () => Promise<AskState>, after?: () => void) {
    setBusy(true);
    setError(null);
    try {
      setState(await work());
      after?.();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  if (!state) return <ErrorLine>{error}</ErrorLine>;

  const service = serviceOf(state.connected ? state.service : chosen) ?? (AI_SERVICES[0] as AiService);

  if (!state.connected) {
    const addressShown = address || service.baseUrl;
    return (
      <Card
        title={title}
        hint="Questions about the company, answered by an AI from everything written here. Any service works; Gemini is free."
      >
        <div className="aiservices" role="radiogroup" aria-label="Which AI">
          {AI_SERVICES.map((option) => (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={option.id === chosen}
              className={`aiservice${option.id === chosen ? " aiservice--on" : ""}`}
              onClick={() => {
                setChosen(option.id);
                setAddress("");
                setError(null);
              }}
            >
              <span className="aiservice__name">
                {option.label}
                {option.free && <span className="badge badge--ok">Free</span>}
              </span>
              <span className="aiservice__tagline">{option.tagline}</span>
            </button>
          ))}
        </div>

        <form
          className="aicard__connect anim-spring"
          key={service.id}
          onSubmit={(event) => {
            event.preventDefault();
            const input = { service: service.id, key, baseUrl: address };
            const parsed = connectInput.safeParse(input);
            if (!parsed.success) {
              setError(parsed.error.issues[0]?.message ?? "Check the details.");
              return;
            }
            void run(() => window.caulder.ask.connect(input), () => setKey(""));
          }}
          noValidate
        >
          <h3 className="aicard__heading">Connecting {service.label}</h3>
          <Steps service={service} />
          {service.link && (
            <div className="actions">
              <a className="btn btn--sm" href={service.link.url} target="_blank" rel="noreferrer noopener">
                {service.link.label}
                <ExternalLink size={13} aria-hidden />
              </a>
            </div>
          )}

          {(service.id === "custom" || service.id === "ollama") && (
            <label className="field">
              <span className="field__label">Address</span>
              <input
                className="input"
                value={addressShown}
                placeholder="https://api.example.com/v1"
                spellCheck={false}
                disabled={busy}
                onChange={(event) => setAddress(event.target.value)}
              />
            </label>
          )}
          {service.key !== "none" && (
            <label className="field">
              <span className="field__label">{service.label} API key</span>
              <input
                className="input"
                type="password"
                value={key}
                placeholder={service.keyHint}
                autoComplete="off"
                spellCheck={false}
                disabled={busy || !state.canEncrypt}
                onChange={(event) => setKey(event.target.value)}
              />
            </label>
          )}

          <p className="card__hint aicard__privacy">{service.privacy}</p>
          <ErrorLine>{error}</ErrorLine>
          {!state.canEncrypt && (
            <p className="card__hint">This machine will not encrypt a stored key, so Caulder will not keep one.</p>
          )}
          <div className="actions">
            <button type="submit" className="btn btn--primary" disabled={busy || !state.canEncrypt}>
              <PlugZap size={15} aria-hidden />
              {busy ? "Checking" : `Connect ${service.label}`}
            </button>
          </div>
        </form>
      </Card>
    );
  }

  const models = state.models.some((option) => option.id === state.model) || !state.model
    ? state.models
    : [{ id: state.model, label: state.model }, ...state.models];

  return (
    <Card title={title} hint="Questions about the company, answered by an AI from everything written here.">
      <div className="aicard__connected">
        <PlugZap size={15} aria-hidden />
        <span>
          <strong>{service.label}</strong> is connected
          {state.last4 ? (
            <>
              {" "}
              with a key ending <strong>{state.last4}</strong>, encrypted by Windows
            </>
          ) : state.baseUrl ? (
            <> at {state.baseUrl}</>
          ) : null}
          .
        </span>
        <button
          type="button"
          className="btn btn--sm btn--ghost btn--danger"
          onClick={() => void run(() => window.caulder.ask.disconnect())}
          disabled={busy}
        >
          <Unplug size={13} aria-hidden />
          Disconnect
        </button>
      </div>

      <div className="field aicard__row">
        <label className="field__label" htmlFor="ai-model">
          Model
        </label>
        <div className="aicard__model">
          <Select
            id="ai-model"
            value={state.model ?? ""}
            disabled={busy}
            onChange={(next) => void run(() => window.caulder.ask.setModel(next))}
            options={models.map((option) => ({
              value: option.id,
              label: option.label === option.id ? option.id : `${option.label} (${option.id})`,
            }))}
          />
          <button
            type="button"
            className="btn btn--sm btn--ghost"
            onClick={() => void run(() => window.caulder.ask.refreshModels())}
            disabled={busy}
          >
            <RefreshCw size={13} aria-hidden />
            Read the list again
          </button>
        </div>
        <form
          className="aicard__typed"
          onSubmit={(event) => {
            event.preventDefault();
            void run(() => window.caulder.ask.setModel(typedModel), () => setTypedModel(""));
          }}
        >
          <input
            className="input"
            value={typedModel}
            aria-label="Another model's name"
            placeholder="Or type another model's name"
            spellCheck={false}
            disabled={busy}
            onChange={(event) => setTypedModel(event.target.value)}
          />
          <button type="submit" className="btn btn--sm" disabled={busy || typedModel.trim() === ""}>
            Use it
          </button>
        </form>
      </div>

      <div className="field aicard__row">
        <span className="field__label">How much of the company it reads</span>
        <Chips
          aria-label="How much of the company it reads"
          value={state.context}
          disabled={busy}
          onChange={(next: ContextSize) => void run(() => window.caulder.ask.setContext(next))}
          options={CONTEXT_SIZES.map((size) => ({ value: size, label: CONTEXT_LABEL[size] }))}
        />
        <span className="card__hint">{CONTEXT_HINT[state.context]}</span>
      </div>

      <ErrorLine>{error}</ErrorLine>

      <p className="card__hint aicard__privacy">
        {service.privacy} Nothing is sent until you ask, and each answer lists what went: the company&apos;s dossier,
        the same documents as Export for an AI, with registration and account numbers masked.
      </p>
    </Card>
  );
}
