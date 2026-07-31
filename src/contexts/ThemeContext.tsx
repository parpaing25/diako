import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type Theme = "clair" | "sombre" | "systeme";
const CLE = "dk_theme";

interface ThemeState {
  theme: Theme;
  /** Ce qui est réellement affiché, une fois « systeme » résolu. */
  effectif: "clair" | "sombre";
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeState>({
  theme: "systeme",
  effectif: "clair",
  setTheme: () => {},
});

function lire(): Theme {
  try {
    const v = localStorage.getItem(CLE);
    if (v === "clair" || v === "sombre" || v === "systeme") return v;
  } catch {
    /* stockage indisponible */
  }
  return "systeme";
}

function prefereSombre(): boolean {
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    return false;
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(lire);
  const [systeme, setSysteme] = useState<boolean>(prefereSombre);

  // Suit le réglage de l'appareil tant que l'utilisateur n'a pas choisi.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const h = (e: MediaQueryListEvent) => setSysteme(e.matches);
    mq.addEventListener?.("change", h);
    return () => mq.removeEventListener?.("change", h);
  }, []);

  const effectif: "clair" | "sombre" =
    theme === "systeme" ? (systeme ? "sombre" : "clair") : theme;

  useEffect(() => {
    document.documentElement.classList.toggle("dark", effectif === "sombre");
    // La barre d'adresse d'Android prend cette couleur : sans mise à jour, elle
    // reste teal en thème sombre et jure avec le reste de l'écran.
    document
      .querySelector('meta[name="theme-color"]:not([media])')
      ?.setAttribute("content", effectif === "sombre" ? "#0C1A1D" : "#0E7C86");
  }, [effectif]);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    try {
      localStorage.setItem(CLE, t);
    } catch {
      /* navigation privée */
    }
  }, []);

  const value = useMemo(() => ({ theme, effectif, setTheme }), [theme, effectif, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme() {
  return useContext(ThemeContext);
}
