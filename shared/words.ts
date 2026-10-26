/**
 * An amount written out in words, as Indian invoices usually carry it
 * ("Rupees Sixty-Six Thousand Eighty Only") and cheques anywhere do (PLAN.md,
 * part fourteen). Whole units, like every amount in Caulder.
 */

const ONES = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function belowThousand(value: number): string {
  const hundreds = Math.floor(value / 100);
  const rest = value % 100;
  const tens = rest < 20 ? ONES[rest] : `${TENS[Math.floor(rest / 10)]}${rest % 10 ? `-${ONES[rest % 10]}` : ""}`;
  return [hundreds ? `${ONES[hundreds]} Hundred` : "", tens].filter(Boolean).join(" ");
}

/** India's grouping: crore, lakh, thousand. Everywhere else's: billion, million, thousand. */
function spell(value: number, indian: boolean): string {
  if (value === 0) return "Zero";
  const scales = indian
    ? [
        { size: 10_000_000, name: "Crore" },
        { size: 100_000, name: "Lakh" },
        { size: 1000, name: "Thousand" },
      ]
    : [
        { size: 1_000_000_000, name: "Billion" },
        { size: 1_000_000, name: "Million" },
        { size: 1000, name: "Thousand" },
      ];
  const parts: string[] = [];
  let left = value;
  for (const scale of scales) {
    const count = Math.floor(left / scale.size);
    if (count > 0) {
      // A crore of crores is still said in crores.
      parts.push(`${count >= 1000 ? spell(count, indian) : belowThousand(count)} ${scale.name}`);
      left %= scale.size;
    }
  }
  if (left > 0) parts.push(belowThousand(left));
  return parts.join(" ");
}

/** "Rupees Sixty-Six Thousand Eighty Only"; "US Dollars One Thousand Two Hundred Only". */
export function amountInWords(value: number, currency: string): string {
  const whole = Math.round(Math.abs(value));
  const code = currency.toUpperCase();
  let name = code === "INR" ? "Rupees" : code;
  if (code !== "INR") {
    try {
      const said = new Intl.DisplayNames(["en"], { type: "currency" }).of(code);
      if (said) name = said.replace(/\b\w/g, (letter) => letter.toUpperCase()).replace(/(?<!s)$/, "s");
    } catch {
      name = code;
    }
  }
  return `${name} ${spell(whole, code === "INR")} Only`;
}
