export type CurrencyCode = "EUR" | "USD" | "GBP";
export type DateFormat = "es" | "us";

const CURRENCY_LOCALE: Record<CurrencyCode, string> = {
  EUR: "es-ES",
  USD: "en-US",
  GBP: "en-GB"
};

const DATE_LOCALE: Record<DateFormat, string> = {
  es: "es-ES",
  us: "en-US"
};

export function formatCurrencyByPreference(value: number, currency: CurrencyCode) {
  return new Intl.NumberFormat(CURRENCY_LOCALE[currency], {
    style: "currency",
    currency,
    maximumFractionDigits: 2
  }).format(value);
}

export function formatDateByPreference(dateInput: string | Date, dateFormat: DateFormat, options?: Intl.DateTimeFormatOptions) {
  const value = typeof dateInput === "string" ? new Date(`${dateInput}T00:00:00`) : dateInput;
  return value.toLocaleDateString(DATE_LOCALE[dateFormat], options);
}

export function formatMonthByPreference(monthValue: string, dateFormat: DateFormat) {
  const [year, month] = monthValue.split("-").map(Number);
  const date = new Date(year, month - 1, 1);
  return date.toLocaleDateString(DATE_LOCALE[dateFormat], { month: "long", year: "numeric" });
}
