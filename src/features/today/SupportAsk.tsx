import { useEffect, useId, useState } from "react";
import { Heart, X } from "lucide-react";
import { SUPPORT, type SupportAnswer } from "@shared/support";

/**
 * The ask for support, WinRAR's way (PLAN.md, part six): Caulder is free, and
 * now and then it says who made it and how to help.
 *
 * One line at the foot of Today - below the work, never between it and the
 * quick line, and never a window. First a month after Caulder is first
 * opened; *Not now* asks again in three months; supporting or *Don't ask
 * again* ends it. Nothing is held back either way, and it keeps quiet while
 * an invoice is overdue: that is not the moment.
 */
export function SupportAsk({ quiet }: { quiet: boolean }) {
  const id = useId();
  const [ask, setAsk] = useState(false);
  const [thanked, setThanked] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let live = true;
    window.caulder.app.support().then((state) => live && setAsk(state.ask), () => undefined);
    return () => {
      live = false;
    };
  }, []);

  function answer(given: SupportAnswer) {
    setAsk(false);
    void window.caulder.app.answerSupport(given).catch(() => undefined);
  }

  function support() {
    window.open(SUPPORT.sponsors, "_blank");
    // Trusted, not checked: somebody who went to help is not asked again.
    void window.caulder.app.answerSupport("never").catch(() => undefined);
    setThanked(true);
  }

  if (thanked) {
    return (
      <p className="supportask supportask--thanks" role="status">
        <Heart size={13} aria-hidden /> Thank you. It keeps Caulder free for everybody.
      </p>
    );
  }
  if (!ask || quiet) return null;

  return (
    <section className="supportask" aria-labelledby={`${id}-said`}>
      <Heart size={13} aria-hidden className="supportask__mark" />
      <p id={`${id}-said`} className="supportask__said">
        Caulder is free, and one college student in India makes it. If it has earned its place in your day, you can
        help keep it going.
      </p>
      <button type="button" className="supportask__go" onClick={support}>
        Support it on GitHub
      </button>
      {SUPPORT.upi && (
        <button
          type="button"
          className="supportask__go"
          onClick={() => void navigator.clipboard.writeText(SUPPORT.upi).then(() => setCopied(true))}
          title="Copies the UPI ID, to pay from any UPI app"
        >
          {copied ? "UPI ID copied" : `UPI: ${SUPPORT.upi}`}
        </button>
      )}
      <button type="button" className="btn btn--sm btn--ghost" onClick={() => answer("later")}>
        Not now
      </button>
      <button
        type="button"
        className="supportask__never"
        onClick={() => answer("never")}
        aria-label="Don't ask again"
        title="Don't ask again. About Caulder in Settings has the ways to help, always."
      >
        <X size={13} aria-hidden />
      </button>
    </section>
  );
}
