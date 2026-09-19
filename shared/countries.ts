/**
 * Countries (after 0.3): where a company is decides its money, its phone
 * numbers and which filing calendar it starts from. A company names its
 * country once; everything here is worked out from the ISO code.
 *
 * Names are not stored: `countryName` asks Intl, so they read in the
 * person's own language. The table holds what Intl does not know - each
 * country's usual currency and its calling code.
 */

type Country = { code: string; currency: string; dial: string };

/** ISO 3166-1 alpha-2, the currency most prices there are in, and the calling code. */
const TABLE =
  "AD EUR 376|AE AED 971|AF AFN 93|AG XCD 1|AI XCD 1|AL ALL 355|AM AMD 374|AO AOA 244|AR ARS 54|AS USD 1|AT EUR 43|AU AUD 61|" +
  "AW AWG 297|AX EUR 358|AZ AZN 994|BA BAM 387|BB BBD 1|BD BDT 880|BE EUR 32|BF XOF 226|BG BGN 359|BH BHD 973|BI BIF 257|" +
  "BJ XOF 229|BL EUR 590|BM BMD 1|BN BND 673|BO BOB 591|BQ USD 599|BR BRL 55|BS BSD 1|BT BTN 975|BW BWP 267|BY BYN 375|" +
  "BZ BZD 501|CA CAD 1|CC AUD 61|CD CDF 243|CF XAF 236|CG XAF 242|CH CHF 41|CI XOF 225|CK NZD 682|CL CLP 56|CM XAF 237|" +
  "CN CNY 86|CO COP 57|CR CRC 506|CU CUP 53|CV CVE 238|CW ANG 599|CX AUD 61|CY EUR 357|CZ CZK 420|DE EUR 49|DJ DJF 253|" +
  "DK DKK 45|DM XCD 1|DO DOP 1|DZ DZD 213|EC USD 593|EE EUR 372|EG EGP 20|EH MAD 212|ER ERN 291|ES EUR 34|ET ETB 251|" +
  "FI EUR 358|FJ FJD 679|FK FKP 500|FM USD 691|FO DKK 298|FR EUR 33|GA XAF 241|GB GBP 44|GD XCD 1|GE GEL 995|GF EUR 594|" +
  "GG GBP 44|GH GHS 233|GI GIP 350|GL DKK 299|GM GMD 220|GN GNF 224|GP EUR 590|GQ XAF 240|GR EUR 30|GT GTQ 502|GU USD 1|" +
  "GW XOF 245|GY GYD 592|HK HKD 852|HN HNL 504|HR EUR 385|HT HTG 509|HU HUF 36|ID IDR 62|IE EUR 353|IL ILS 972|IM GBP 44|" +
  "IN INR 91|IO USD 246|IQ IQD 964|IR IRR 98|IS ISK 354|IT EUR 39|JE GBP 44|JM JMD 1|JO JOD 962|JP JPY 81|KE KES 254|" +
  "KG KGS 996|KH KHR 855|KI AUD 686|KM KMF 269|KN XCD 1|KP KPW 850|KR KRW 82|KW KWD 965|KY KYD 1|KZ KZT 7|LA LAK 856|" +
  "LB LBP 961|LC XCD 1|LI CHF 423|LK LKR 94|LR LRD 231|LS LSL 266|LT EUR 370|LU EUR 352|LV EUR 371|LY LYD 218|MA MAD 212|" +
  "MC EUR 377|MD MDL 373|ME EUR 382|MF EUR 590|MG MGA 261|MH USD 692|MK MKD 389|ML XOF 223|MM MMK 95|MN MNT 976|MO MOP 853|" +
  "MP USD 1|MQ EUR 596|MR MRU 222|MS XCD 1|MT EUR 356|MU MUR 230|MV MVR 960|MW MWK 265|MX MXN 52|MY MYR 60|MZ MZN 258|" +
  "NA NAD 264|NC XPF 687|NE XOF 227|NF AUD 672|NG NGN 234|NI NIO 505|NL EUR 31|NO NOK 47|NP NPR 977|NR AUD 674|NU NZD 683|" +
  "NZ NZD 64|OM OMR 968|PA USD 507|PE PEN 51|PF XPF 689|PG PGK 675|PH PHP 63|PK PKR 92|PL PLN 48|PM EUR 508|PR USD 1|" +
  "PS ILS 970|PT EUR 351|PW USD 680|PY PYG 595|QA QAR 974|RE EUR 262|RO RON 40|RS RSD 381|RU RUB 7|RW RWF 250|SA SAR 966|" +
  "SB SBD 677|SC SCR 248|SD SDG 249|SE SEK 46|SG SGD 65|SH SHP 290|SI EUR 386|SK EUR 421|SL SLE 232|SM EUR 378|SN XOF 221|" +
  "SO SOS 252|SR SRD 597|SS SSP 211|ST STN 239|SV USD 503|SX ANG 1|SY SYP 963|SZ SZL 268|TC USD 1|TD XAF 235|TG XOF 228|" +
  "TH THB 66|TJ TJS 992|TK NZD 690|TL USD 670|TM TMT 993|TN TND 216|TO TOP 676|TR TRY 90|TT TTD 1|TV AUD 688|TW TWD 886|" +
  "TZ TZS 255|UA UAH 380|UG UGX 256|US USD 1|UY UYU 598|UZ UZS 998|VA EUR 39|VC XCD 1|VE VES 58|VG USD 1|VI USD 1|" +
  "VN VND 84|VU VUV 678|WF XPF 681|WS WST 685|XK EUR 383|YE YER 967|YT EUR 262|ZA ZAR 27|ZM ZMW 260|ZW USD 263";

const COUNTRIES: readonly Country[] = TABLE.split("|").map((entry) => {
  const [code = "", currency = "", dial = ""] = entry.split(" ");
  return { code, currency, dial };
});

const BY_CODE = new Map(COUNTRIES.map((country) => [country.code, country]));

export function countryOf(code: string | null | undefined): Country | null {
  return code ? (BY_CODE.get(code.toUpperCase()) ?? null) : null;
}

export function isCountry(value: unknown): value is string {
  return typeof value === "string" && BY_CODE.has(value);
}

/** "India", "Deutschland" - in the language asked for, or the person's own. */
export function countryName(code: string, locale?: string): string {
  try {
    return new Intl.DisplayNames(locale ? [locale] : undefined, { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** Any currency Intl knows by its ISO code - which is every one in use. */
export function isCurrency(value: unknown): value is string {
  if (typeof value !== "string" || !/^[A-Z]{3}$/.test(value)) return false;
  try {
    return Intl.supportedValuesOf("currency").includes(value);
  } catch {
    return true;
  }
}

/** Timezones that say the country outright, for a first guess when the language does not. */
const ZONE_COUNTRY: Record<string, string> = {
  "Asia/Kolkata": "IN",
  "Asia/Calcutta": "IN",
  "Europe/London": "GB",
  "Europe/Dublin": "IE",
  "Europe/Berlin": "DE",
  "Europe/Paris": "FR",
  "Europe/Madrid": "ES",
  "Europe/Rome": "IT",
  "Europe/Amsterdam": "NL",
  "Europe/Stockholm": "SE",
  "Europe/Warsaw": "PL",
  "Asia/Singapore": "SG",
  "Asia/Dubai": "AE",
  "Asia/Tokyo": "JP",
  "Asia/Karachi": "PK",
  "Asia/Dhaka": "BD",
  "Asia/Manila": "PH",
  "Asia/Jakarta": "ID",
  "Africa/Lagos": "NG",
  "Africa/Nairobi": "KE",
  "Africa/Johannesburg": "ZA",
  "Australia/Sydney": "AU",
  "Australia/Melbourne": "AU",
  "Pacific/Auckland": "NZ",
  "America/Toronto": "CA",
  "America/Sao_Paulo": "BR",
  "America/Mexico_City": "MX",
};

/**
 * A first guess at where someone is: a timezone that only one country uses,
 * then the region in their language setting ("en-IN" is India). The clock
 * first, because it is set to where the computer is, while a great many
 * computers in India - and elsewhere - run in American English. Null when
 * neither says - they choose.
 */
export function guessCountry(language: string | undefined, timezone: string | undefined): string | null {
  const zone = timezone ? ZONE_COUNTRY[timezone] : undefined;
  if (zone) return zone;
  try {
    const region = language ? new Intl.Locale(language).maximize().region : undefined;
    // "en" maximises to the US, which says nothing about where an English speaker is.
    const said = language && /[-_][A-Za-z]{2}\b/.test(language) ? region : undefined;
    if (said && BY_CODE.has(said)) return said;
  } catch {
    // An unreadable language setting is no guess at all.
  }
  return null;
}

/** The currency a company in this country starts on; its own choice wins afterwards. */
export function currencyFor(country: string | null): string | null {
  return countryOf(country)?.currency ?? null;
}

/** Every country, by name in the person's language, for a picker. */
export function countryOptions(locale?: string): { code: string; name: string }[] {
  return COUNTRIES.map((country) => ({ code: country.code, name: countryName(country.code, locale) })).sort((a, b) =>
    a.name.localeCompare(b.name, locale),
  );
}
