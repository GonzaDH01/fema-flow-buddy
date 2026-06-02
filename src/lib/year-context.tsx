import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

const KEY = "fema_year";
const YEARS = [2024, 2025, 2026, 2027];

type Ctx = { year: number; setYear: (y: number) => void; years: number[] };
const YearCtx = createContext<Ctx>({ year: new Date().getFullYear(), setYear: () => {}, years: YEARS });

export function YearProvider({ children }: { children: ReactNode }) {
  const [year, setYearState] = useState<number>(new Date().getFullYear());

  useEffect(() => {
    const v = typeof window !== "undefined" ? window.localStorage.getItem(KEY) : null;
    if (v) setYearState(Number(v));
  }, []);

  const setYear = (y: number) => {
    setYearState(y);
    if (typeof window !== "undefined") window.localStorage.setItem(KEY, String(y));
  };

  return <YearCtx.Provider value={{ year, setYear, years: YEARS }}>{children}</YearCtx.Provider>;
}

export const useYear = () => useContext(YearCtx);