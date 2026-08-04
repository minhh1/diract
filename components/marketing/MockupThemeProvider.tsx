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

const MockupThemeContext = createContext<{ isDark: boolean; setDark: (dark: boolean) => void } | null>(null);

export function MockupThemeProvider({ children }: { children: ReactNode }) {
  const [isDark, setIsDark] = useState(false);
  return (
    <MockupThemeContext.Provider value={{ isDark, setDark: setIsDark }}>
      {children}
    </MockupThemeContext.Provider>
  );
}

export function useMockupTheme(): boolean {
  return useContext(MockupThemeContext)?.isDark ?? false;
}

// Two labelled segments split by a vertical divider (rather than one pill
// button whose label swaps) -- both options are visible at once, and each
// is its own click target that sets that mode directly.
export function MockupThemeToggle() {
  const ctx = useContext(MockupThemeContext);
  if (!ctx) return null;
  return (
    <div className="fixed bottom-6 right-6 z-40 flex items-center bg-slate-900 text-white rounded-full shadow-xl shadow-black/20 text-[12px] font-medium overflow-hidden">
      <button
        onClick={() => ctx.setDark(false)}
        className={`flex items-center gap-1.5 pl-4 pr-3.5 py-2.5 transition-colors ${ctx.isDark ? "text-slate-400 hover:text-white" : "text-white"}`}
      >
        <Sun size={13} /> Light
      </button>
      <span className="w-px h-4 bg-white/15" />
      <button
        onClick={() => ctx.setDark(true)}
        className={`flex items-center gap-1.5 pl-3.5 pr-4 py-2.5 transition-colors ${ctx.isDark ? "text-white" : "text-slate-400 hover:text-white"}`}
      >
        <Moon size={13} /> Dark
      </button>
    </div>
  );
}
