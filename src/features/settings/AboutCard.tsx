import { useEffect, useState } from "react";
import { Copy, FileText, Heart, Shield, Star } from "lucide-react";
import { SUPPORT } from "@shared/support";
import { Card } from "@/components/Card";
import { messageOf } from "@/lib/errors";

/**
 * About Caulder (PLAN.md, part six, phase 23): that it is free, who made it,
 * and the ways to help - GitHub Sponsors, which takes no cut and takes cards
 * from anywhere, and UPI for anybody in India. Then the privacy page and the
 * licences of what it ships. Every way to help is here always, whatever was
 * answered on Today.
 */
export function AboutCard() {
  const [version, setVersion] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    window.caulder.app.version().then((next) => live && setVersion(next), () => undefined);
    return () => {
      live = false;
    };
  }, []);

  return (
    <Card
      icon={<Heart size={15} aria-hidden />}
      title="About Caulder"
      hint={version ? `Caulder ${version}, free.` : "Free."}
      className="about"
    >
      <p className="card__hint">
        No account, no ads, and nothing about you leaves this computer unless you connect something yourself. Caulder
        is made by one college student in India. If it has earned its place in your day, you can help keep it going -
        or tell one other founder about it, which helps as much.
      </p>
      <div className="actions">
        <button type="button" className="btn btn--sm btn--primary" onClick={() => window.open(SUPPORT.sponsors, "_blank")}>
          <Heart size={14} aria-hidden />
          Sponsor on GitHub
        </button>
        {SUPPORT.upi && (
          <button
            type="button"
            className="btn btn--sm"
            onClick={() =>
              void navigator.clipboard.writeText(SUPPORT.upi).then(() => setMessage(`${SUPPORT.upi} is copied. Pay it from any UPI app.`))
            }
          >
            <Copy size={14} aria-hidden />
            UPI: {SUPPORT.upi}
          </button>
        )}
        <button type="button" className="btn btn--sm" onClick={() => window.open(SUPPORT.repo, "_blank")}>
          <Star size={14} aria-hidden />
          Star it on GitHub
        </button>
      </div>
      <div className="actions">
        <button type="button" className="btn btn--sm btn--ghost" onClick={() => window.open(SUPPORT.privacy, "_blank")}>
          <Shield size={14} aria-hidden />
          Privacy
        </button>
        <button
          type="button"
          className="btn btn--sm btn--ghost"
          onClick={() => {
            setError(null);
            window.caulder.app.licences().catch((cause: unknown) => setError(messageOf(cause)));
          }}
        >
          <FileText size={14} aria-hidden />
          Licences
        </button>
      </div>
      {message && (
        <p className="card__hint" role="status">
          {message}
        </p>
      )}
      {error && <p className="field__error">{error}</p>}
    </Card>
  );
}
