import { useEffect, useId, useState } from "react";
import { Check, Trash2 } from "lucide-react";
import { MAIL_PRESETS, type MailAccount } from "@shared/mailaccounts";
import { Card } from "@/components/Card";
import { ErrorLine } from "@/components/ErrorLine";
import { Explain } from "@/components/Explain";
import { Select } from "@/components/Select";
import { messageOf } from "@/lib/errors";

/**
 * Mail accounts beside the Google script: Zoho, Outlook, Yahoo, iCloud, or
 * any server that speaks SMTP.
 *
 * Adding one tries it first, so a wrong password is found here and not when a
 * message will not go. The password is encrypted by Windows and never shown
 * again - to change it, remove the account and add it back.
 */
export function MailAccountsCard() {
  const id = useId();
  const [accounts, setAccounts] = useState<MailAccount[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [preset, setPreset] = useState(MAIL_PRESETS[0]?.id ?? "other");
  const [label, setLabel] = useState("");
  const [address, setAddress] = useState("");
  const [password, setPassword] = useState("");
  const [host, setHost] = useState(MAIL_PRESETS[0]?.host ?? "");
  const [port, setPort] = useState(String(MAIL_PRESETS[0]?.port ?? 587));
  const [secure, setSecure] = useState(MAIL_PRESETS[0]?.secure ?? false);
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void window.caulder.mailAccounts.list().then(setAccounts, () => setAccounts([]));
  }, []);

  const chosen = MAIL_PRESETS.find((each) => each.id === preset);

  function pick(next: string) {
    setPreset(next);
    const found = MAIL_PRESETS.find((each) => each.id === next);
    if (!found) return;
    setHost(found.host);
    setPort(String(found.port));
    setSecure(found.secure);
  }

  function reset() {
    setAdding(false);
    setLabel("");
    setAddress("");
    setPassword("");
    setUsername("");
    setError(null);
  }

  async function add() {
    setBusy(true);
    setError(null);
    try {
      const next = await window.caulder.mailAccounts.add({
        label: label.trim() || chosen?.label || address.trim(),
        address: address.trim(),
        host: host.trim(),
        port: Number(port),
        secure,
        username: username.trim() || address.trim(),
        password,
      });
      setAccounts(next);
      reset();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
      // Not kept in memory a moment longer than it has to be.
      setPassword("");
    }
  }

  const act = (change: () => Promise<MailAccount[]>) =>
    void change().then(setAccounts, (cause: unknown) => setError(messageOf(cause)));

  if (!accounts) return null;

  return (
    <Card
      title="Other mail accounts"
      hint="Send to a contact from Zoho, Outlook or any other account, beside or instead of Gmail."
      actions={
        !adding && (
          <button type="button" className="btn btn--sm" onClick={() => setAdding(true)}>
            Add an account
          </button>
        )
      }
    >
      {accounts.length > 0 && (
        <ul className="rules" aria-label="Mail accounts">
          {accounts.map((account) => (
            <li key={account.id} className="rule">
              <span className="rule__text">
                <strong>{account.label}</strong> · {account.address}
                {account.isDefault && <span className="card__hint"> · used first</span>}
              </span>
              {!account.isDefault && accounts.length > 1 && (
                <button type="button" className="btn btn--sm btn--ghost" onClick={() => act(() => window.caulder.mailAccounts.setDefault(account.id))}>
                  <Check size={14} aria-hidden /> Use first
                </button>
              )}
              <button
                type="button"
                className="btn btn--sm btn--ghost"
                aria-label={`Remove ${account.address}`}
                title="Remove"
                onClick={() => act(() => window.caulder.mailAccounts.remove(account.id))}
              >
                <Trash2 size={14} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      {accounts.length === 0 && !adding && (
        <p className="card__hint">None yet. Gmail goes through the Google script above, which also sees replies.</p>
      )}

      {adding && (
        <form
          className="mailacct"
          onSubmit={(event) => {
            event.preventDefault();
            void add();
          }}
        >
          <div className="field">
            <span className="field__label">Provider</span>
            <Select
              value={preset}
              onChange={pick}
              aria-label="Provider"
              options={MAIL_PRESETS.map((each) => ({ value: each.id, label: each.label }))}
            />
            {chosen?.note && <p className="card__hint">{chosen.note}</p>}
          </div>
          <div className="leadform__row">
            <div className="field">
              <label className="field__label" htmlFor={`${id}-address`}>
                Email address
              </label>
              <input id={`${id}-address`} className="input" type="email" autoComplete="off" value={address} onChange={(event) => setAddress(event.target.value)} required />
            </div>
            <div className="field">
              <label className="field__label" htmlFor={`${id}-label`}>
                Name it
              </label>
              <input id={`${id}-label`} className="input" placeholder={chosen?.label ?? "Work"} value={label} onChange={(event) => setLabel(event.target.value)} />
            </div>
          </div>
          <div className="field">
            <label className="field__label" htmlFor={`${id}-password`}>
              App password
            </label>
            <input
              id={`${id}-password`}
              className="input"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>
          <details className="mailacct__server" open={preset === "other"}>
            <summary>Server settings</summary>
            <div className="leadform__row">
              <div className="field">
                <label className="field__label" htmlFor={`${id}-host`}>
                  SMTP server
                </label>
                <input id={`${id}-host`} className="input" value={host} onChange={(event) => setHost(event.target.value)} required />
              </div>
              <div className="field">
                <label className="field__label" htmlFor={`${id}-port`}>
                  Port
                </label>
                <input id={`${id}-port`} className="input" inputMode="numeric" value={port} onChange={(event) => setPort(event.target.value)} required />
              </div>
            </div>
            <label className="checkline">
              <input type="checkbox" className="tickbox" checked={secure} onChange={(event) => setSecure(event.target.checked)} />
              <span className="checkline__text">
                <span className="checkline__title">SSL from the start</span>
                <span className="card__hint">On for port 465; off for 587, which switches to it after connecting.</span>
              </span>
            </label>
            <div className="field">
              <label className="field__label" htmlFor={`${id}-user`}>
                Username, if it is not the address
              </label>
              <input id={`${id}-user`} className="input" autoComplete="off" value={username} onChange={(event) => setUsername(event.target.value)} />
            </div>
          </details>
          <ErrorLine>{error}</ErrorLine>
          <div className="actions">
            <button type="submit" className="btn btn--sm btn--primary" disabled={busy || !address.trim() || !password}>
              {busy ? "Trying it…" : "Try it and add"}
            </button>
            <button type="button" className="btn btn--sm btn--ghost" onClick={reset} disabled={busy}>
              Cancel
            </button>
          </div>
        </form>
      )}
      {!adding && <ErrorLine>{error}</ErrorLine>}

      <Explain>
        <p>
          The password is encrypted by Windows the moment it is saved and never shown again - most providers want an app password
          here, made in their security settings, not the account&rsquo;s own. These accounts only send: they cannot see a reply, so
          a message from one gets no automatic follow-up, and one scheduled for later is sent by Caulder when it is due, so Caulder
          has to be running then.
        </p>
      </Explain>
    </Card>
  );
}
