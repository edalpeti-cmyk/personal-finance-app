export type AssetCurrency = "EUR" | "USD" | "GBP";

export const SUPPORTED_ASSET_CURRENCIES: AssetCurrency[] = ["EUR", "USD", "GBP"];

export const FALLBACK_RATES_TO_EUR: Record<AssetCurrency, number> = {
  EUR: 1,
  USD: 0.92,
  GBP: 1.17
};

type FrankfurterResponse = {
  rates?: Partial<Record<"USD" | "GBP", number>>;
};

export async function fetchRatesToEur(): Promise<Record<AssetCurrency, number>> {
  try {
    const response = await fetch("https://api.frankfurter.app/latest?from=EUR&to=USD,GBP", {
      cache: "no-store"
    });

    if (!response.ok) {
      return FALLBACK_RATES_TO_EUR;
    }

    const data = (await response.json()) as FrankfurterResponse;
    const usdPerEur = data.rates?.USD;
    const gbpPerEur = data.rates?.GBP;

    return {
      EUR: 1,
      USD: usdPerEur && usdPerEur > 0 ? Number((1 / usdPerEur).toFixed(6)) : FALLBACK_RATES_TO_EUR.USD,
      GBP: gbpPerEur && gbpPerEur > 0 ? Number((1 / gbpPerEur).toFixed(6)) : FALLBACK_RATES_TO_EUR.GBP
    };
  } catch {
    return FALLBACK_RATES_TO_EUR;
  }
}

export function convertToEur(amount: number, currency: string | null | undefined, ratesToEur: Record<AssetCurrency, number>) {
  const cleanCurrency = (currency ?? "EUR").toUpperCase() as AssetCurrency;
  const rate = ratesToEur[cleanCurrency] ?? 1;
  return amount * rate;
}
