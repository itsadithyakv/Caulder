import { ArrowRight, Brain, Check, Upload, UserPlus, Wallet } from "lucide-react";
import type { RouteId } from "@/app/routes";
import { Card } from "@/components/Card";
import { GoogleCard } from "@/features/settings/GoogleCard";
import { AiCard } from "@/features/settings/AiCard";
import { SafeCopy } from "./SafeCopy";

/**
 * What to connect, once, after the company is made.
 *
 * Caulder works on its own: one file on this machine, nothing to sign in to.
 * Two things are worth connecting, and both are somebody else's service with
 * its own steps - Google, for the calendar, tasks and sending email, and an
 * AI, for asking the brain questions. Those steps are the reason this screen
 * exists: they are five minutes of clicking in someone else's console, and a
 * settings card nobody opens is where that gets abandoned.
 *
 * Everything here can be skipped and done later; Settings has the same cards
 * and a way back to this page.
 */
export function SetupScreen({
  companyName,
  onGoTo,
  onDone,
}: {
  companyName: string;
  onGoTo: (route: RouteId) => void;
  onDone: () => void;
}) {
  return (
    <div className="setup anim-stagger">
      <Card title={`Caulder is yours, ${companyName}`}>
        <p className="setup__lead">
          Caulder already works. Your day, your contacts, your deals and your money live in one file
          on this computer &mdash; nothing to sign in to, nothing sent anywhere.
        </p>
        <p className="setup__lead">
          First, a copy of it somewhere other than this computer. Then two things that belong to somebody
          else, which is the only reason they take any setting up: <strong>Google</strong>, for your
          calendar, tasks and email, and an <strong>AI</strong>, to ask the brain questions. Both
          optional, both can wait.
        </p>
        <div className="actions">
          <button type="button" className="btn btn--sm btn--ghost" onClick={onDone}>
            Skip this for now
            <ArrowRight size={14} aria-hidden />
          </button>
        </div>
      </Card>

      {/* First, because it is the one thing here that protects what is
          already yours: a copy of it somewhere other than this computer. */}
      <section className="setup__step">
        <h2 className="setup__title">
          <span className="setup__num">1</span>
          A copy somewhere else
          <span className="badge badge--neutral">Recommended &middot; 1 min</span>
        </h2>
        <SafeCopy />
      </section>

      <section className="setup__step">
        <h2 className="setup__title">
          <span className="setup__num">2</span>
          Google: your calendar, tasks, email, contacts and backups
          <span className="badge badge--neutral">Optional &middot; 5 min</span>
        </h2>
        <GoogleCard startOpen />
      </section>

      <section className="setup__step">
        <h2 className="setup__title">
          <span className="setup__num">3</span>
          An AI, to ask the brain
          <span className="badge badge--neutral">Optional &middot; 2 min</span>
        </h2>
        <p className="setup__lead">
          <em>Which deals should I chase</em>, <em>how long does the money last</em> &mdash; answered
          from everything Caulder holds. Gemini is free with a Google account; a paid key, or a model
          running on this computer, works the same way.
        </p>
        <AiCard title="Which AI answers" />
      </section>

      <section className="setup__step">
        <h2 className="setup__title">
          <span className="setup__num">4</span>
          Your contacts
        </h2>
        <Card title="Bring the list you already have">
          <p className="card__hint">
            From a spreadsheet or a pasted list.
          </p>
          <div className="actions">
            <button type="button" className="btn" onClick={() => onGoTo("import")}>
              <Upload size={15} aria-hidden />
              Import a spreadsheet or paste a list
            </button>
            <button type="button" className="btn" onClick={() => onGoTo("leads")}>
              <UserPlus size={15} aria-hidden />
              Add one by hand
            </button>
          </div>
        </Card>
      </section>

      <section className="setup__step">
        <h2 className="setup__title">
          <span className="setup__num">5</span>
          What the company knows
        </h2>
        <Card title="Write down the things you keep looking up">
          <p className="card__hint">
            Twelve things worth writing down first, and what you pay for each month.
          </p>
          <div className="actions">
            <button type="button" className="btn" onClick={() => onGoTo("brain")}>
              <Brain size={15} aria-hidden />
              Open the brain
            </button>
            <button type="button" className="btn" onClick={() => onGoTo("money")}>
              <Wallet size={15} aria-hidden />
              Add what you pay for
            </button>
          </div>
        </Card>
      </section>

      <div className="setup__foot">
        <button type="button" className="btn btn--primary" onClick={onDone}>
          <Check size={15} aria-hidden />
          Done, take me to Today
        </button>
        <p className="card__hint">Settings has all of this again, under Connections.</p>
      </div>
    </div>
  );
}
