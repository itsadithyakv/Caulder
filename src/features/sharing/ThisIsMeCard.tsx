import { useEffect, useId, useState } from "react";
import { Check } from "lucide-react";
import { Card } from "@/components/Card";
import { ErrorLine } from "@/components/ErrorLine";
import { messageOf } from "@/lib/errors";

/**
 * "This is me": the name every revision written here carries, so that with
 * two founders a page says who changed it. Sharing the brain asks for it.
 */
export function ThisIsMeCard() {
  const id = useId();
  const [name, setName] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    window.caulder.share
      .me()
      .then((current) => {
        setSaved(current);
        setName(current ?? "");
      })
      .catch((cause: unknown) => setError(messageOf(cause)));
  }, []);

  async function save() {
    setError(null);
    try {
      const next = await window.caulder.share.setMe(name);
      setSaved(next);
      setName(next ?? "");
    } catch (cause) {
      setError(messageOf(cause));
    }
  }

  const changed = name.trim() !== (saved ?? "");

  return (
    <Card title="This is me" hint="The name on every page you change. With two founders, it is how each of you sees who wrote what.">
      <form
        className="thisisme"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <label className="visually-hidden" htmlFor={`${id}-name`}>
          Your name
        </label>
        <input
          id={`${id}-name`}
          className="input"
          value={name}
          maxLength={60}
          placeholder="Your first name"
          onChange={(event) => setName(event.target.value)}
        />
        <button type="submit" className="btn btn--sm btn--primary" disabled={!changed}>
          Save
        </button>
        {!changed && saved && (
          <span className="thisisme__saved">
            <Check size={14} aria-hidden />
            Saved
          </span>
        )}
      </form>
      <ErrorLine>{error}</ErrorLine>
    </Card>
  );
}
