import { ArrowRight, Brain, Check, Upload, UserPlus, Wallet } from "lucide-react";
import type { RouteId } from "@/app/routes";
import { Card } from "@/components/Card";
import { GoogleCard } from "@/features/settings/GoogleCard";
import { AiCard } from "@/features/settings/AiCard";

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
          Everything in Caulder already works: your day, your contacts, your deals and your money all live in one
          file on this computer, with nothing to sign in to and nothing sent anywhere.
        </p>
        <p className="setup__lead">
          Two things are worth connecting, because they belong to somebody else: <strong>Google</strong>, so your
          day and your tasks are on your phone and email goes from your own Gmail, and an <strong>AI</strong>, so
          you can ask the brain questions. Both are optional, both are about five minutes, and both can wait.
        </p>
        <div className="actions">
          <button type="button" className="btn btn--sm btn--ghost" onClick={onDone}>
            Skip this for now
            <ArrowRight size={14} aria-hidden />
          </button>
        </div>
      </Card>

      <section className="setup__step">
        <h2 className="setup__title">
          <span className="setup__num">1</span>
          Google: your calendar, your tasks, your email
          <span className="badge badge--neutral">Optional</span>
        </h2>
        <p className="setup__lead">
          Caulder never signs in to Google. Instead you paste a script into your own Google account and Caulder
          talks to that - which is what lets it touch your calendar and send from your Gmail without asking you to
          trust it with your account. The steps below are in the order Google&rsquo;s own menus say them.
        </p>
        <GoogleCard startOpen />
      </section>

      <section className="setup__step">
        <h2 className="setup__title">
          <span className="setup__num">2</span>
          An AI, to ask the brain
          <span className="badge badge--neutral">Optional</span>
        </h2>
        <p className="setup__lead">
          Ask questions about your own company - <em>which deals should I chase</em>, <em>how long does the money
          last</em>, <em>what do people object to on calls</em> - answered from everything Caulder holds. Google
          Gemini is free with a Google account and is the one to start with; a paid key for a frontier model, or a
          model running on this computer, works the same way.
        </p>
        <AiCard title="Which AI answers" />
      </section>

      <section className="setup__step">
        <h2 className="setup__title">
          <span className="setup__num">3</span>
          Your contacts
        </h2>
        <Card title="Bring the list you already have">
          <p className="card__hint">
            Caulder is about a list you have already built. A spreadsheet is matched column by column, with a
            preview and an undo; a list pasted from anywhere is read the same way.
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
          <span className="setup__num">4</span>
          What the company knows
        </h2>
        <Card title="Write down the things you keep looking up">
          <p className="card__hint">
            The brain has a list of twelve things worth writing down first - your one-liner, your registration
            numbers, the bank account invoices print, this quarter&rsquo;s goals - and it ticks itself off as you
            write them. Call scripts live there too, and what you pay for every month, which is what makes
            renewals turn up on Today and the runway add up.
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
