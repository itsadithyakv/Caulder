import { useEffect, useState } from "react";
import { ErrorLine } from "@/components/ErrorLine";
import { Select } from "@/components/Select";
import { messageOf } from "@/lib/errors";
import { countryChoices } from "@/lib/places";
import { countryName } from "@shared/countries";
import { TERMS_OFFERED, sayTerms, type ClientBilling as Billing, type CompanyBilling } from "@shared/billing";
import { regionsFor } from "@shared/tax";
import { HoursToBill } from "./HoursToBill";

/**
 * A client's billing details (PLAN.md, part thirteen): their tax number and
 * where they are - which decides the tax on what they are sent - their own
 * payment terms and hourly rate when they differ from the company's, and
 * the hours not yet billed. Folded away: most contacts are billed the usual
 * way, and a line says how.
 */
export function ClientBilling({ companyId, leadId, currency, onBilled }: { companyId: string; leadId: string; currency: string; onBilled: () => void }) {
  const [billing, setBilling] = useState<Billing | null>(null);
  const [company, setCompany] = useState<CompanyBilling | null>(null);
  const [number, setNumber] = useState("");
  const [hourly, setHourly] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([window.caulder.billing.client(companyId, leadId), window.caulder.billing.company(companyId)])
      .then(([mine, theirs]) => {
        setBilling(mine);
        setCompany(theirs);
        setNumber(mine.taxNumber ?? "");
        setHourly(mine.hourlyRate === null ? "" : String(mine.hourlyRate));
      })
      .catch((cause: unknown) => setError(messageOf(cause)));
  }, [companyId, leadId]);

  if (!billing || !company) return error ? <ErrorLine>{error}</ErrorLine> : null;

  const system = company.rules;
  const where = billing.taxCountry ?? company.country;
  const regions = regionsFor(where === company.country ? company.country : null);
  const terms = billing.paymentTerms ?? company.paymentTerms ?? 14;

  async function save(patch: Partial<Billing>) {
    if (!billing) return;
    setError(null);
    try {
      setBilling(await window.caulder.billing.setClient(companyId, leadId, { ...billing, ...patch }));
    } catch (cause) {
      setError(messageOf(cause));
    }
  }

  const said = [
    billing.taxNumber ? `${system.numberLabel} ${billing.taxNumber}` : null,
    billing.taxCountry && billing.taxCountry !== company.country ? countryName(billing.taxCountry) : null,
    `pays within ${sayTerms(terms).toLowerCase()}`,
  ].filter(Boolean);

  return (
    <details className="clientbilling">
      <summary className="clientbilling__summary">
        <span className="clientbilling__title">Billing</span>
        <span className="clientbilling__said">{said.join(" · ")}</span>
      </summary>
      <ErrorLine>{error}</ErrorLine>
      <div className="clientbilling__grid">
        <label className="field">
          <span className="field__label">{system.numberLabel}</span>
          <input className="input" value={number} onChange={(event) => setNumber(event.target.value)} onBlur={() => void save({ taxNumber: number.trim() || null })} />
        </label>
        <div className="field">
          <span className="field__label">Country</span>
          <Select
            aria-label="Their country"
            value={billing.taxCountry ?? ""}
            onChange={(code) => void save({ taxCountry: code || null, taxRegion: null })}
            options={[{ value: "", label: company.country ? `${countryName(company.country)}, as the company` : "Not said" }, ...countryChoices()]}
          />
        </div>
        {regions.length > 0 && (
          <div className="field">
            <span className="field__label">{company.country === "CA" ? "Province" : "State"}</span>
            <Select
              aria-label="Their state or province"
              value={billing.taxRegion ?? ""}
              onChange={(code) => void save({ taxRegion: code || null })}
              options={[{ value: "", label: company.country === "IN" ? "From their GSTIN" : "Not said" }, ...regions.map((region) => ({ value: region.code, label: region.name }))]}
            />
          </div>
        )}
        <label className="field">
          <span className="field__label">Hourly rate</span>
          <input
            className="input"
            value={hourly}
            onChange={(event) => setHourly(event.target.value)}
            onBlur={() => {
              const value = Math.round(Number(hourly));
              void save({ hourlyRate: hourly.trim() === "" || !Number.isFinite(value) ? null : value });
            }}
            inputMode="numeric"
            placeholder={company.hourlyRate === null ? currency : `${company.hourlyRate}, as the company`}
          />
        </label>
      </div>
      <div className="field">
        <span className="field__label">Pays within</span>
        <div className="chips">
          {TERMS_OFFERED.map((days) => (
            <button key={days} type="button" className={`chip${terms === days ? " chip--on" : ""}`} onClick={() => void save({ paymentTerms: days })}>
              {sayTerms(days)}
            </button>
          ))}
        </div>
      </div>
      <HoursToBill companyId={companyId} leadId={leadId} currency={currency} onBilled={onBilled} />
    </details>
  );
}
