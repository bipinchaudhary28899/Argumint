/**
 * ThemeContext.tsx
 *
 * Manages UI theme — Light, Dark, Glacier, and any future modes.
 * - Persists choice to localStorage under key "theme"
 * - Applies `data-theme="<name>"` on <html> so the CSS cascade handles everything
 * - Adding a new theme: add it to the THEMES array and the Theme type. That's it.
 */

import { createContext, useContext, useEffect, useState } from "react";

export type Theme = "light" | "dark" | "glacier";

export interface ThemeMeta {
  id:    Theme;
  label: string;
  icon:  string;
  desc:  string;
}

/** Ordered list of available themes. Controls cycle order + picker UI. */
export const THEMES: ThemeMeta[] = [
  { id: "light",   label: "Light",   icon: "☀️",  desc: "Clean lavender white"     },
  { id: "dark",    label: "Dark",    icon: "🌙",  desc: "Deep space"               },
  { id: "glacier", label: "Glacier", icon: "🧊",  desc: "Icy frosted glass · Lv.5" },
  // ── add future themes here ──
];

interface ThemeContextValue {
  theme:    Theme;
  setTheme: (t: Theme) => void;
  /** Cycles through THEMES in order */
  cycle:    () => void;
  /** Kept for backwards compat — toggles light ↔ dark only */
  toggle:   () => void;
  meta:     ThemeMeta;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme:    "light",
  setTheme: () => {},
  cycle:    () => {},
  toggle:   () => {},
  meta:     THEMES[0],
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const saved = localStorage.getItem("theme") as Theme | null;
    return THEMES.find(t => t.id === saved) ? (saved as Theme) : "light";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const setTheme = (t: Theme) => {
    setThemeState(t);
    localStorage.setItem("theme", t);
    document.documentElement.setAttribute("data-theme", t);
  };

  const cycle = () => {
    const idx  = THEMES.findIndex(t => t.id === theme);
    const next = THEMES[(idx + 1) % THEMES.length];
    setTheme(next.id);
  };

  const toggle = () => setTheme(theme === "dark" ? "light" : "dark");

  const meta = THEMES.find(t => t.id === theme) ?? THEMES[0];

  return (
    <ThemeContext.Provider value={{ theme, setTheme, cycle, toggle, meta }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
