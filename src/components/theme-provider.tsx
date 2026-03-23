"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { CurrencyCode, DateFormat } from "@/lib/preferences-format";

type ThemeMode = "dark" | "light";

type ThemeContextValue = {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  currency: CurrencyCode;
  setCurrency: (currency: CurrencyCode) => void;
  dateFormat: DateFormat;
  setDateFormat: (dateFormat: DateFormat) => void;
  hideBalances: boolean;
  setHideBalances: (hide: boolean) => void;
  showLocalValues: boolean;
  setShowLocalValues: (show: boolean) => void;
  reduceMotion: boolean;
  setReduceMotion: (reduce: boolean) => void;
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
  toggleSettings: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = "personal-finance-theme";
const CURRENCY_KEY = "personal-finance-currency";
const DATE_KEY = "personal-finance-date-format";
const HIDE_BALANCES_KEY = "personal-finance-hide-balances";
const LOCAL_VALUES_KEY = "personal-finance-show-local-values";
const REDUCE_MOTION_KEY = "personal-finance-reduce-motion";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>("dark");
  const [currency, setCurrencyState] = useState<CurrencyCode>("EUR");
  const [dateFormat, setDateFormatState] = useState<DateFormat>("es");
  const [hideBalances, setHideBalancesState] = useState(false);
  const [showLocalValues, setShowLocalValuesState] = useState(true);
  const [reduceMotion, setReduceMotionState] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    const storedTheme = window.localStorage.getItem(STORAGE_KEY);
    const storedCurrency = window.localStorage.getItem(CURRENCY_KEY);
    const storedDate = window.localStorage.getItem(DATE_KEY);
    const storedHideBalances = window.localStorage.getItem(HIDE_BALANCES_KEY);
    const storedLocalValues = window.localStorage.getItem(LOCAL_VALUES_KEY);
    const storedReduceMotion = window.localStorage.getItem(REDUCE_MOTION_KEY);
    const nextTheme = storedTheme === "light" ? "light" : "dark";
    const nextCurrency = storedCurrency === "USD" || storedCurrency === "GBP" || storedCurrency === "DKK" ? storedCurrency : "EUR";
    const nextDate = storedDate === "us" ? "us" : "es";
    const nextHideBalances = storedHideBalances === "true";
    const nextShowLocalValues = storedLocalValues !== "false";
    const nextReduceMotion = storedReduceMotion === "true";

    setThemeState(nextTheme);
    setCurrencyState(nextCurrency);
    setDateFormatState(nextDate);
    setHideBalancesState(nextHideBalances);
    setShowLocalValuesState(nextShowLocalValues);
    setReduceMotionState(nextReduceMotion);
    document.documentElement.dataset.theme = nextTheme;
    document.documentElement.dataset.hideBalances = nextHideBalances ? "true" : "false";
    document.documentElement.dataset.motion = nextReduceMotion ? "reduced" : "full";
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

  const setHideBalances = (hide: boolean) => {
    setHideBalancesState(hide);
    document.documentElement.dataset.hideBalances = hide ? "true" : "false";
    window.localStorage.setItem(HIDE_BALANCES_KEY, String(hide));
  };

  const setShowLocalValues = (show: boolean) => {
    setShowLocalValuesState(show);
    window.localStorage.setItem(LOCAL_VALUES_KEY, String(show));
  };

  const setReduceMotion = (reduce: boolean) => {
    setReduceMotionState(reduce);
    document.documentElement.dataset.motion = reduce ? "reduced" : "full";
    window.localStorage.setItem(REDUCE_MOTION_KEY, String(reduce));
  };

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      setTheme,
      currency,
      setCurrency,
      dateFormat,
      setDateFormat,
      hideBalances,
      setHideBalances,
      showLocalValues,
      setShowLocalValues,
      reduceMotion,
      setReduceMotion,
      settingsOpen,
      setSettingsOpen,
      toggleSettings: () => setSettingsOpen((current) => !current)
    }),
    [currency, dateFormat, hideBalances, reduceMotion, settingsOpen, showLocalValues, theme]
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
