import { CURRENCIES } from "@shared/domain";
import { countryOptions as countries } from "@shared/countries";

/**
 * The options for where a company is: its country, its money and its clock,
 * as the pickers show them - in the person's own language, the common
 * currencies first, every timezone the system knows.
 */

export function countryChoices(): { value: string; label: string }[] {
  return countries().map((country) => ({ value: country.code, label: country.name }));
}

/** "INR · Indian Rupee": the code first, because it is what a total shows. */
export function currencyChoices(current?: string): { value: string; label: string }[] {
  let names: Intl.DisplayNames | null = null;
  try {
    names = new Intl.DisplayNames(undefined, { type: "currency" });
  } catch {
    names = null;
  }
  const label = (code: string) => {
    const name = names?.of(code);
    return name && name !== code ? `${code} · ${name}` : code;
  };
  let all: string[] = [];
  try {
    all = Intl.supportedValuesOf("currency");
  } catch {
    all = [...CURRENCIES];
  }
  const common = [...CURRENCIES] as string[];
  const rest = all.filter((code) => !common.includes(code));
  const ordered = [...common, ...rest];
  if (current && !ordered.includes(current)) ordered.unshift(current);
  return ordered.map((code) => ({ value: code, label: label(code) }));
}

export function timezoneChoices(current: string): { value: string; label: string }[] {
  let zones: string[] = [];
  try {
    zones = Intl.supportedValuesOf("timeZone");
  } catch {
    zones = [];
  }
  if (!zones.includes(current)) zones = [current, ...zones];
  return zones.map((zone) => ({ value: zone, label: zone.replace(/_/g, " ") }));
}
