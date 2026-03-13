"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

type ThemeMode = "dark" | "light";
type CurrencyCode = "EUR" | "USD" | "GBP";
type DateFormat = "es" | "us";

type ThemeContextValue = {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  currency: CurrencyCode;
  setCurrency: (currency: CurrencyCode) => void;
  dateFormat: DateFormat;
  setDateFormat: (dateFormat: DateFormat) => void;
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
  toggleSettings: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = "personal-finance-theme";
const CURRENCY_KEY = "personal-finance-currency";
const DATE_KEY = "personal-finance-date-format";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>("dark");
  const [currency, setCurrencyState] = useState<CurrencyCode>("EUR");
  const [dateFormat, setDateFormatState] = useState<DateFormat>("es");
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    const storedTheme = window.localStorage.getItem(STORAGE_KEY);
    const storedCurrency = window.localStorage.getItem(CURRENCY_KEY);
    const storedDate = window.localStorage.getItem(DATE_KEY);
    const nextTheme = storedTheme === "light" ? "light" : "dark";
    setThemeState(nextTheme);
    setCurrencyState(storedCurrency === "USD" || storedCurrency === "GBP" ? storedCurrency : "EUR");
    setDateFormatState(storedDate === "us" ? "us" : "es");
    document.documentElement.dataset.theme = nextTheme;
  }, []);

  const setTheme = (nextTheme: ThemeMode) => {
    setThemeState(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
    window.localStorage.setItem(STORAGE_KEY, nextTheme);
  };

  const setCurrency = (nextCurrency: CurrencyCode) => {
    setCurrencyState(nextCurrency);
    window.localStorage.setItem(CURRENCY_KEY, nextCurrency);
  };

  const setDateFormat = (nextDateFormat: DateFormat) => {
    setDateFormatState(nextDateFormat);
    window.localStorage.setItem(DATE_KEY, nextDateFormat);
  };

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      setTheme,
      currency,
      setCurrency,
      dateFormat,
      setDateFormat,
      settingsOpen,
      setSettingsOpen,
      toggleSettings: () => setSettingsOpen((current) => !current)
    }),
    [currency, dateFormat, settingsOpen, theme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme debe usarse dentro de ThemeProvider");
  }

  return context;
}
