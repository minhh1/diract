"use client";

// Lets a visitor preview every product mockup on a marketing page in dark
// mode, without the marketing page itself ever adopting dark mode (see
// app/(marketing)/layout.tsx's own comment on why ThemeProvider/next-themes
// isn't mounted here). Deliberately NOT next-themes: this only ever
// controls a `dark` class on the small wrapper divs around each mockup
// (Hero.tsx, FeatureSpotlight.tsx), reusing the exact same global `.dark`
// CSS overrides (app/globals.css) the real logged-in app uses, so a
// mockup's dark-mode colors are guaranteed to match production exactly.
import { createContext, useContext, useState, type ReactNode } from "react";
import { Moon, Sun } from "lucide-react";

const MockupThemeContext = createContext<{ isDark: boolean; toggle: () => void } | null>(null);

export function MockupThemeProvider({ children }: { children: ReactNode }) {
  const [isDark, setIsDark] = useState(false);
  return (
    <MockupThemeContext.Provider value={{ isDark, toggle: () => setIsDark((d) => !d) }}>
      {children}
    </MockupThemeContext.Provider>
  );
}

export function useMockupTheme(): boolean {
  return useContext(MockupThemeContext)?.isDark ?? false;
}

export function MockupThemeToggle() {
  const ctx = useContext(MockupThemeContext);
  if (!ctx) return null;
  return (
    <button
      onClick={ctx.toggle}
      className="fixed bottom-6 right-6 z-40 flex items-center gap-2 pl-3.5 pr-4 py-2.5 bg-slate-900 text-white text-[12px] font-medium rounded-full shadow-xl shadow-black/20 hover:bg-slate-800 transition-colors"
    >
      {ctx.isDark ? <Sun size={14} /> : <Moon size={14} />}
      Preview in {ctx.isDark ? "light" : "dark"} mode
    </button>
  );
}
