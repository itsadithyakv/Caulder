import { useEffect, useState } from "react";
import { Card } from "@/components/Card";
import { ErrorLine } from "@/components/ErrorLine";
import { messageOf } from "@/lib/errors";
import {
  INVOICE_FOLDERING,
  INVOICE_FOLDERING_LABEL,
  INVOICE_INKS,
  INVOICE_LAYOUTS,
  INVOICE_LAYOUT_LABEL,
  formatInvoiceNumber,
  type InvoiceInk,
  type InvoiceLook,
} from "@shared/invoicelook";
import type { TaxRules } from "@shared/taxrules";

/**
 * How the company's invoices look, and a folder of your own their copies go
 * into (PLAN.md, part fourteen). Each change is kept as it is made; *See a
 * sample* prints a made-up one in the look, since a PDF is the only honest
 * preview of a PDF.
 */
export function InvoiceLookCard({ companyId }: { companyId: string }) {
  const [look, setLook] = useState<InvoiceLook | null>(null);
  const [footer, setFooter] = useState("");
  const [prefix, setPrefix] = useState("");
  const [idLabel, setIdLabel] = useState("");
  const [idValue, setIdValue] = useState("");
  const [rules, setRules] = useState<TaxRules | null>(null);
  const [country, setCountry] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    window.caulder.billing
      .invoiceLook(companyId)
      .then((found) => {
        setLook(found);
        setFooter(found.footer ?? "");
        setPrefix(found.numbering.prefix);
      })
      .catch((cause: unknown) => setError(messageOf(cause)));
    // The numbers a business usually prints where it is, and when its year starts, from its own rules.
    window.caulder.billing
      .company(companyId)
      .then((billing) => {
        setRules(billing.rules);
        setCountry(billing.country);
      })
      .catch(() => setRules(null));
  }, [companyId]);

  if (!look) return error ? <ErrorLine>{error}</ErrorLine> : null;

  async function run(work: () => Promise<InvoiceLook | null | void>) {
    setError(null);
    setBusy(true);
    try {
      const next = await work();
      if (next) setLook(next);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }
  const save = (patch: Partial<InvoiceLook>) => {
    if (!look) return;
    void run(() => window.caulder.billing.setInvoiceLook(companyId, { ...look, ...patch }));
  };

  return (
    <Card title="Invoices">
      <div className="billing">
        <ErrorLine>{error}</ErrorLine>

        <div className="field">
          <span className="field__label">Layout</span>
          <div className="chips">
            {INVOICE_LAYOUTS.map((layout) => (
              <button key={layout} type="button" className={`chip${look.layout === layout ? " chip--on" : ""}`} onClick={() => save({ layout })}>
                {INVOICE_LAYOUT_LABEL[layout]}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span className="field__label">Colour</span>
          <div className="invoicelook__inks">
            {(Object.keys(INVOICE_INKS) as InvoiceInk[]).map((ink) => (
              <button
                key={ink}
                type="button"
                className="invoicelook__ink"
                style={{ background: `var(--doc-ink-${ink})` }}
                aria-pressed={look.ink === ink}
                aria-label={INVOICE_INKS[ink].label}
                title={INVOICE_INKS[ink].label}
                onClick={() => save({ ink })}
              />
            ))}
          </div>
        </div>

        <div className="field">
          <span className="field__label">Logo</span>
          <div className="chips">
            <button type="button" className="btn btn--sm" disabled={busy} onClick={() => void run(() => window.caulder.billing.invoiceLogo(companyId))}>
              {look.logo ? "Change" : "Add a logo"}
            </button>
            {look.logo && (
              <button type="button" className="btn btn--sm" disabled={busy} onClick={() => void run(() => window.caulder.billing.invoiceLogo(companyId, true))}>
                Remove
              </button>
            )}
          </div>
        </div>

        <label className="field">
          <span className="field__label">Closing line</span>
          <input
            className="input"
            value={footer}
            onChange={(event) => setFooter(event.target.value)}
            onBlur={() => {
              const next = footer.trim() || null;
              if (next !== look.footer) save({ footer: next });
            }}
            placeholder="Thank you for your business."
            maxLength={500}
          />
        </label>

        <div className="field">
          <span className="field__label">Numbers under your name</span>
          {look.ids.map((each, index) => (
            <div key={`${each.label}-${index}`} className="chips">
              <span>
                {each.label} {each.value}
              </span>
              <button type="button" className="btn btn--sm btn--ghost" onClick={() => save({ ids: look.ids.filter((_, at) => at !== index) })}>
                Remove
              </button>
            </div>
          ))}
          {look.ids.length < 6 && (
            <div className="chips">
              <input
                className="input billing__rate"
                value={idLabel}
                onChange={(event) => setIdLabel(event.target.value)}
                placeholder={rules?.ids.find((label) => !look.ids.some((each) => each.label === label)) ?? "PAN"}
                aria-label="Which number"
                list={`ids-${companyId}`}
              />
              <datalist id={`ids-${companyId}`}>
                {(rules?.ids ?? []).map((label) => (
                  <option key={label} value={label} />
                ))}
              </datalist>
              <input className="input" value={idValue} onChange={(event) => setIdValue(event.target.value)} placeholder="The number" aria-label="The number" />
              <button
                type="button"
                className="btn btn--sm"
                disabled={!idValue.trim()}
                onClick={() => {
                  const label = idLabel.trim() || rules?.ids.find((each) => !look.ids.some((kept) => kept.label === each)) || "Number";
                  save({ ids: [...look.ids, { label, value: idValue.trim() }] });
                  setIdLabel("");
                  setIdValue("");
                }}
              >
                Add
              </button>
            </div>
          )}
        </div>

        <div className="field">
          <span className="field__label">Numbered</span>
          <div className="chips">
            <input
              className="input billing__rate"
              value={prefix}
              onChange={(event) => setPrefix(event.target.value)}
              onBlur={() => {
                if (prefix.trim() !== look.numbering.prefix) save({ numbering: { ...look.numbering, prefix: prefix.trim() } });
              }}
              placeholder="INV"
              maxLength={5}
              aria-label="Prefix"
            />
            {(
              [
                ["none", "No year"],
                ["calendar", "Year"],
                ["financial", "Financial year"],
              ] as const
            ).map(([year, label]) => (
              <button
                key={year}
                type="button"
                className={`chip${look.numbering.year === year ? " chip--on" : ""}`}
                onClick={() => save({ numbering: { ...look.numbering, year } })}
              >
                {label}
              </button>
            ))}
          </div>
          <span className="field__hint">
            Like {formatInvoiceNumber({ ...look.numbering, prefix: prefix.trim() }, 42, new Date().toISOString().slice(0, 10), rules?.yearStarts ?? 1)}
          </span>
        </div>

        <label className="field checkline">
          <input
            type="checkbox"
            className="tickbox"
            checked={look.words ?? country === "IN"}
            onChange={(event) => save({ words: event.target.checked })}
          />
          <span className="checkline__title">Amount in words</span>
        </label>

        <div className="field">
          <span className="field__label">A copy in your own folder</span>
          {look.folder ? (
            <>
              <span className="invoicelook__folder">{look.folder}</span>
              <div className="chips">
                {INVOICE_FOLDERING.map((foldering) => (
                  <button
                    key={foldering}
                    type="button"
                    className={`chip${look.foldering === foldering ? " chip--on" : ""}`}
                    onClick={() => save({ foldering })}
                  >
                    {INVOICE_FOLDERING_LABEL[foldering]}
                  </button>
                ))}
              </div>
              {look.foldering !== "client" && (
                <label className="checkline">
                  <input
                    type="checkbox"
                    className="tickbox"
                    checked={look.naming === "number-client"}
                    onChange={(event) => save({ naming: event.target.checked ? "number-client" : "number" })}
                  />
                  <span className="checkline__title">Client in the file name</span>
                </label>
              )}
              <div className="chips">
                <button type="button" className="btn btn--sm" disabled={busy} onClick={() => void run(() => window.caulder.billing.invoiceFolder(companyId))}>
                  Change folder
                </button>
                <button type="button" className="btn btn--sm" disabled={busy} onClick={() => save({ folder: null })}>
                  Stop
                </button>
              </div>
            </>
          ) : (
            <div className="chips">
              <button type="button" className="btn btn--sm" disabled={busy} onClick={() => void run(() => window.caulder.billing.invoiceFolder(companyId))}>
                Choose a folder
              </button>
            </div>
          )}
        </div>

        <div>
          <button type="button" className="btn" disabled={busy} onClick={() => void run(() => window.caulder.billing.invoiceSample(companyId))}>
            See a sample
          </button>
        </div>
      </div>
    </Card>
  );
}
