import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
type Theme = "light" | "dark";
interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}
const ThemeContext = createContext<ThemeContextType | undefined>(undefined);
function readPreference(): Theme | null {
  try {
    const value = localStorage.getItem("theme");
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}
export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const explicitPreference = useRef(readPreference() !== null);
  const [theme, setThemeState] = useState<Theme>(
    () =>
      readPreference() ||
      (window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"),
  );
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      if (!explicitPreference.current)
        setThemeState(e.matches ? "dark" : "light");
    };
    media.addEventListener("change", handler);
    return () => media.removeEventListener("change", handler);
  }, []);
  const setTheme = (value: Theme) => {
    explicitPreference.current = true;
    setThemeState(value);
    try {
      localStorage.setItem("theme", value);
    } catch {
      /* Theme remains usable when browser storage is disabled. */
    }
  };
  return (
    <ThemeContext.Provider
      value={{
        theme,
        setTheme,
        toggleTheme: () => setTheme(theme === "light" ? "dark" : "light"),
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};
export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within a ThemeProvider");
  return context;
};
