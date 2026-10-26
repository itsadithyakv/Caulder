import { useEffect, useState } from "react";
import { ErrorLine } from "@/components/ErrorLine";
import { Select } from "@/components/Select";
import { messageOf } from "@/lib/errors";
import type { TaxRules, TaxRulesChanges } from "@shared/taxrules";

type Kept = { changes: TaxRulesChanges; rules: TaxRules; defaults: TaxRules };

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "18, 5, 40, 0" to [18, 5, 40, 0]: numbers only, the rest ignored. */
const ratesOf = (text: string) =>
  text
    .split(/[,\s]+/)
    .map((part) => Number(part.replace("%", "")))
    .filter((value) => Number.isFinite(value) && value >= 0 && value <= 100);

/**
 * The company's tax and invoicing rules, every one of them its own to change
 * (PLAN.md, part fourteen; shared/taxrules.ts). Its country's are shown
 * faintly where nothing was changed, so a change in the law is typed in here
 * the day it comes. Anywhere Caulder does not know starts blank, and this is
 * how its invoices are built.
 */
export function TaxRulesEditor({ companyId, onChange }: { companyId: string; onChange: (rules: TaxRules) => void }) {
  const [kept, setKept] = useState<Kept | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    window.caulder.billing
      .taxRules(companyId)
      .then(setKept)
      .catch((cause: unknown) => setError(messageOf(cause)));
  }, [companyId]);

  if (!kept) return error ? <ErrorLine>{error}</ErrorLine> : null;
  const { rules, defaults, changes } = kept;

  async function save(patch: TaxRulesChanges) {
    if (!kept) return;
    setError(null);
    try {
      const next = await window.caulder.billing.setTaxRules(companyId, { ...kept.rules, ...patch });
      setKept(next);
      setDraft({});
      onChange(next.rules);
    } catch (cause) {
      setError(messageOf(cause));
    }
  }
  async function reset() {
    setError(null);
    try {
      const next = await window.caulder.billing.setTaxRules(companyId, {});
      setKept(next);
      setDraft({});
      onChange(next.rules);
    } catch (cause) {
      setError(messageOf(cause));
    }
  }

  /** A text field kept on blur; empty goes back to the country's. */
  const field = (key: keyof TaxRules, label: string, shown: string, fallback: string, toValue: (text: string) => TaxRulesChanges, long = false) => {
    const value = draft[key] ?? shown;
    const props = {
      className: "input",
      value,
      placeholder: fallback,
      onChange: (event: { target: { value: string } }) => setDraft((current) => ({ ...current, [key]: event.target.value })),
      onBlur: () => {
        if (draft[key] !== undefined && draft[key] !== shown) void save(toValue(draft[key] ?? ""));
      },
      "aria-label": label,
    };
    return (
      <label className="field" key={key}>
        <span className="field__label">{label}</span>
        {long ? <textarea {...props} rows={2} /> : <input {...props} />}
      </label>
    );
  };

  const changed = Object.keys(changes).length;

  return (
    <details className="taxrules">
      <summary>Rules{changed > 0 ? ` (${changed} changed)` : ""}</summary>
      <div className="billing">
        <ErrorLine>{error}</ErrorLine>
        {field("name", "Tax called", rules.name, defaults.name, (text) => ({ name: text.trim() || defaults.name }))}
        {field("numberLabel", "Tax number called", rules.numberLabel, defaults.numberLabel, (text) => ({ numberLabel: text.trim() || defaults.numberLabel }))}
        {field("rates", "Rates, %", rules.rates.join(", "), defaults.rates.join(", ") || "18, 5", (text) => ({ rates: text.trim() ? ratesOf(text) : defaults.rates }))}
        {field("title", "Title when tax is charged", rules.title, defaults.title, (text) => ({ title: text.trim() || defaults.title }))}
        {field("plainTitle", "Title when none is", rules.plainTitle, defaults.plainTitle, (text) => ({ plainTitle: text.trim() || defaults.plainTitle }))}
        {field("exemptNote", "Words when not registered", rules.exemptNote ?? "", defaults.exemptNote ?? "None", (text) => ({ exemptNote: text.trim() || null }), true)}
        {field("threshold", "Registration needed above", rules.threshold ?? "", defaults.threshold ?? "Say it in words", (text) => ({ threshold: text.trim() || null }))}
        {field(
          "thresholdAmount",
          "The same, as a sum",
          rules.thresholdAmount === null ? "" : String(rules.thresholdAmount),
          defaults.thresholdAmount === null ? "None" : String(defaults.thresholdAmount),
          (text) => ({ thresholdAmount: text.trim() === "" ? null : Math.max(0, Math.round(Number(text.replace(/[^\d.]/g, "")) || 0)) }),
        )}
        {field(
          "withholding",
          "Tax clients withhold, and %",
          rules.withholding ? `${rules.withholding.name} ${rules.withholding.rate}` : "",
          defaults.withholding ? `${defaults.withholding.name} ${defaults.withholding.rate}` : "None",
          (text) => {
            const said = /^(.*?)\s*(\d+(?:\.\d+)?)\s*%?\s*$/.exec(text.trim());
            return { withholding: said && said[1] ? { name: said[1].trim(), rate: Number(said[2]) } : null };
          },
        )}
        {(rules.composition || defaults.composition) && (
          <>
            {field("composition", "Composition title", rules.composition?.title ?? "", defaults.composition?.title ?? "", (text) => ({
              composition: { title: text.trim() || (defaults.composition?.title ?? "Bill of supply"), note: rules.composition?.note ?? defaults.composition?.note ?? "" },
            }))}
            {field(
              "composition-note" as keyof TaxRules,
              "Composition words",
              rules.composition?.note ?? "",
              defaults.composition?.note ?? "",
              (text) => ({ composition: { title: rules.composition?.title ?? defaults.composition?.title ?? "Bill of supply", note: text.trim() || (defaults.composition?.note ?? "") } }),
              true,
            )}
          </>
        )}
        <label className="field">
          <span className="field__label">Financial year starts</span>
          <Select
            aria-label="Financial year starts"
            value={String(rules.yearStarts)}
            onChange={(value) => void save({ yearStarts: Number(value) })}
            options={MONTHS.map((month, index) => ({ value: String(index + 1), label: month }))}
          />
        </label>
        {field("ids", "Numbers usually printed", rules.ids.join(", "), defaults.ids.join(", ") || "PAN, Company number", (text) => ({
          ids: text
            .split(",")
            .map((part) => part.trim())
            .filter(Boolean)
            .slice(0, 6),
        }))}
        {changed > 0 && (
          <div>
            <button type="button" className="btn btn--sm" onClick={() => void reset()}>
              Back to the country&apos;s
            </button>
          </div>
        )}
      </div>
    </details>
  );
}
