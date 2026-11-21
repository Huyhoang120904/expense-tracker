import * as React from "react";

export type Theme = "dark" | "light";

export const THEME_STORAGE_KEY = "tally.theme";

const THEME_META_COLORS: Record<Theme, string> = {
  dark: "#0a0a0a",
  light: "#fbfaf8",
};

function isValidTheme(value: unknown): value is Theme {
  return value === "dark" || value === "light";
}

function readInitialTheme(): Theme {
  if (typeof document !== "undefined") {
    const domTheme = document.documentElement.dataset.theme;
    if (isValidTheme(domTheme)) {
      return domTheme;
    }
  }
  if (typeof window !== "undefined") {
    try {
      const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (isValidTheme(stored)) {
        return stored;
      }
    } catch {
      // Ignore storage access errors.
    }
  }
  return "dark";
}

function applyThemeToDocument(theme: Theme): void {
  if (typeof document === "undefined") {
    return;
  }
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute("content", THEME_META_COLORS[theme]);
  }
}

export interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = React.useState<Theme>(readInitialTheme);

  React.useEffect(() => {
    applyThemeToDocument(theme);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore storage access errors.
    }
  }, [theme]);

  React.useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const handleStorage = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY && isValidTheme(event.newValue)) {
        setThemeState(event.newValue);
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const setTheme = React.useCallback((next: Theme) => {
    setThemeState(next);
  }, []);

  const toggleTheme = React.useCallback(() => {
    setThemeState((prev) => (prev === "dark" ? "light" : "dark"));
  }, []);

  const value = React.useMemo<ThemeContextValue>(
    () => ({ theme, setTheme, toggleTheme }),
    [theme, setTheme, toggleTheme],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return ctx;
}
