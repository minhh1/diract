"use client";

// Thin wrapper so app/layout.tsx doesn't import next-themes directly --
// keeps the provider's config (class-based, defaults to the OS setting) in
// one place. Toggled via components/Sidebar.tsx's account menu (useTheme()).
import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ReactNode } from "react";

export default function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem>
      {children}
    </NextThemesProvider>
  );
}
