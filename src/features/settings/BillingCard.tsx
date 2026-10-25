import { useEffect, useState } from "react";
import { Card } from "@/components/Card";
import { ErrorLine } from "@/components/ErrorLine";
import { Select } from "@/components/Select";
import { messageOf } from "@/lib/errors";
import { countryName } from "@shared/countries";
import { TERMS_OFFERED, sayTerms, type CompanyBilling } from "@shared/billing";
import { regionsFor, taxKnown } from "@shared/tax";
import { TaxRulesEditor } from "./TaxRulesEditor";

/**
 * Tax and billing for the company (PLAN.md, part thirteen): whether it
 * charges its country's tax and at what rate, its tax number, how long
 * clients have to pay, and what an hour is billed at. Each client can have
 * their own terms and rate on their page.
 */
export function BillingCard({ companyId, currency }: { companyId: string; currency: string }) {
  const [billing, setBilling] = useState<CompanyBilling | null>(null);
  const [number, setNumber] = useState("");
  const [hourly, setHourly] = useState("");
  const [otherRate, setOtherRate] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    window.caulder.billing
      .company(companyId)
      .then((found) => {
        setBilling(found);
        setNumber(found.taxNumber ?? "");
        setHourly(found.hourlyRate === null ? "" : String(found.hourlyRate));
        // A rate of its own shows in the box, where it can be changed.
        if (found.taxRate !== null && !found.rules.rates.includes(found.taxRate)) setOtherRate(String(found.taxRate));
      })
      .catch((cause: unknown) => setError(messageOf(cause)));
  }, [companyId]);

  if (!billing) return error ? <ErrorLine>{error}</ErrorLine> : null;

  // The company's own rules (shared/taxrules.ts): its tax's name, rates and words, as it keeps them.
  const system = billing.rules;
  const regions = regionsFor(billing.country);

  async function save(patch: Partial<CompanyBilling>) {
    if (!billing) return;
    setError(null);
    const { country: _country, rules: _rules, ...rest } = { ...billing, ...patch };
    void _country;
    void _rules;
    try {
      setBilling(await window.caulder.billing.setCompany(companyId, rest));
    } catch (cause) {
      setError(messageOf(cause));
    }
  }

  const rates = system.rates.filter((rate) => rate > 0);

  return (
    <Card title="Tax and billing" hint={billing.country ? `${countryName(billing.country)}: ${system.name}.` : "No country set: build the rules below."}>
      <div className="billing">
      <ErrorLine>{error}</ErrorLine>

      {system.composition ? (
        // Where the law has a scheme between charging and not - India's composition - it is one of three.
        <div className="field">
          <div className="chips" role="radiogroup" aria-label={system.name}>
            {(
              [
                ["none", "Not registered"],
                ["on", "Registered"],
                ["composition", "Composition"],
              ] as const
            ).map(([status, label]) => {
              const current = billing.taxOn ? "on" : billing.composition ? "composition" : "none";
              return (
                <button
                  key={status}
                  type="button"
                  role="radio"
                  aria-checked={current === status}
                  className={`chip${current === status ? " chip--on" : ""}`}
                  onClick={() => void save({ taxOn: status === "on", composition: status === "composition", taxRate: billing.taxRate ?? rates[0] ?? null })}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="checkline">
          <button
            type="button"
            className="toggle"
            role="switch"
            aria-checked={billing.taxOn}
            aria-label={`Charge ${system.name}`}
            onClick={() => void save({ taxOn: !billing.taxOn, taxRate: billing.taxRate ?? rates[0] ?? null })}
          >
            <span className="toggle__thumb" />
          </button>
          <span className="checkline__text">
            <span className="checkline__title">Charge {system.name}</span>
            {!taxKnown(billing.country) && billing.taxOn && rates.length === 0 && <span className="card__hint">Set the rates under Rules.</span>}
          </span>
        </div>
      )}
      {!billing.taxOn && !billing.composition && system.threshold && <p className="card__hint">Needed above {system.threshold}.</p>}
      {billing.composition && (
        <label className="field">
          <span className="field__label">{system.numberLabel}</span>
          <input className="input" value={number} onChange={(event) => setNumber(event.target.value)} onBlur={() => void save({ taxNumber: number.trim() || null })} />
        </label>
      )}

      {billing.taxOn && (
        <>
          <div className="field">
            <span className="field__label">Usual rate</span>
            <div className="chips">
              {rates.map((rate) => (
                <button
                  key={rate}
                  type="button"
                  className={`chip${billing.taxRate === rate ? " chip--on" : ""}`}
                  onClick={() => {
                    setOtherRate("");
                    void save({ taxRate: rate });
                  }}
                >
                  {rate}%
                </button>
              ))}
              <input
                className="input billing__rate"
                value={otherRate}
                onChange={(event) => setOtherRate(event.target.value)}
                onBlur={(event) => {
                  const value = Number(event.target.value);
                  if (event.target.value.trim() !== "" && Number.isFinite(value)) void save({ taxRate: value });
                }}
                inputMode="decimal"
                placeholder="Other %"
                aria-label="Another rate"
              />
            </div>
          </div>

          <label className="field checkline">
            <input type="checkbox" className="tickbox" checked={billing.taxInclusive} onChange={(event) => void save({ taxInclusive: event.target.checked })} />
            <span className="checkline__title">Prices include {system.name}</span>
          </label>

          <label className="field">
            <span className="field__label">{system.numberLabel}</span>
            <input className="input" value={number} onChange={(event) => setNumber(event.target.value)} onBlur={() => void save({ taxNumber: number.trim() || null })} />
          </label>

          {regions.length > 0 && (
            <label className="field">
              <span className="field__label">{billing.country === "CA" ? "Province" : "State"}</span>
              <Select
                value={billing.taxRegion ?? ""}
                onChange={(value) => void save({ taxRegion: value || null })}
                aria-label={billing.country === "CA" ? "Province" : "State"}
                options={[{ value: "", label: billing.country === "IN" ? "From the GSTIN" : "Choose" }, ...regions.map((region) => ({ value: region.code, label: region.name }))]}
              />
            </label>
          )}
        </>
      )}

      <div className="field">
        <span className="field__label">Clients pay within</span>
        <div className="chips">
          {TERMS_OFFERED.map((days) => (
            <button
              key={days}
              type="button"
              className={`chip${(billing.paymentTerms ?? 14) === days ? " chip--on" : ""}`}
              onClick={() => void save({ paymentTerms: days })}
            >
              {sayTerms(days)}
            </button>
          ))}
        </div>
      </div>

      <label className="field">
        <span className="field__label">An hour is billed at</span>
        <input
          className="input"
          value={hourly}
          onChange={(event) => setHourly(event.target.value)}
          onBlur={() => {
            const value = Math.round(Number(hourly));
            void save({ hourlyRate: hourly.trim() === "" || !Number.isFinite(value) ? null : value });
          }}
          inputMode="numeric"
          placeholder={currency}
        />
      </label>

      <TaxRulesEditor companyId={companyId} onChange={(rules) => setBilling((current) => (current ? { ...current, rules } : current))} />
      </div>
    </Card>
  );
}
