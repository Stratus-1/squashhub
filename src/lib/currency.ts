// Curated shortlist of currencies supported per club.
// Add more here when a new market opens — no schema change required.
export interface CurrencyOption {
  code: string;   // ISO 4217
  symbol: string; // display symbol
  name: string;
}

export const CURRENCY_OPTIONS: CurrencyOption[] = [
  { code: "ZAR", symbol: "R",   name: "South African Rand" },
  { code: "USD", symbol: "$",   name: "US Dollar" },
  { code: "EUR", symbol: "€",   name: "Euro" },
  { code: "GBP", symbol: "£",   name: "British Pound" },
  { code: "ZWL", symbol: "Z$",  name: "Zimbabwean Dollar" },
  { code: "BWP", symbol: "P",   name: "Botswana Pula" },
  { code: "NAD", symbol: "N$",  name: "Namibian Dollar" },
  { code: "MZN", symbol: "MT",  name: "Mozambican Metical" },
  { code: "KES", symbol: "KSh", name: "Kenyan Shilling" },
  { code: "NGN", symbol: "₦",   name: "Nigerian Naira" },
  { code: "AUD", symbol: "A$",  name: "Australian Dollar" },
  { code: "CAD", symbol: "C$",  name: "Canadian Dollar" },
];

export function getCurrencyOption(code?: string | null): CurrencyOption {
  const c = (code || "ZAR").toUpperCase();
  return CURRENCY_OPTIONS.find(o => o.code === c) || CURRENCY_OPTIONS[0];
}

/**
 * Format a monetary amount in the club's currency.
 * Pass the club (or an object with currency_symbol / currency_code).
 * Falls back to "R" if the club has no currency set (existing ZAR clubs).
 */
export function formatMoney(
  amount: number | null | undefined,
  club?: { currency_symbol?: string | null; currency_code?: string | null } | null,
  opts: { decimals?: number; withCode?: boolean } = {},
): string {
  const n = Number(amount ?? 0);
  const symbol = club?.currency_symbol || getCurrencyOption(club?.currency_code).symbol;
  const decimals = opts.decimals ?? (Number.isInteger(n) ? 0 : 2);
  const formatted = n.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  const code = club?.currency_code || "ZAR";
  return opts.withCode ? `${symbol}${formatted} ${code}` : `${symbol}${formatted}`;
}
