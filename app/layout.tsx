// app/layout.tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import AppLoader from "@/components/AppLoader";
import ThemeProvider from "@/components/ThemeProvider";
import VisitBeacon from "@/components/VisitBeacon";
import VersionCheckBanner from "@/components/VersionCheckBanner";
import SessionHealthBanner from "@/components/SessionHealthBanner";
import { BUILD_ID } from "@/lib/buildId";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Diract",
  description: "Property & legal ERP",
  // Read by VersionCheckBanner.tsx as "the build this page was actually
  // served with" -- a plain <meta>, not next/head, so it's present in the
  // initial HTML before any client JS runs.
  other: { "app-build-id": BUILD_ID },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // suppressHydrationWarning -- next-themes sets the `dark`/`light` class
    // on this element via an inline script that runs before React hydrates
    // (so there's no flash of the wrong theme), which means the server-
    // rendered class attribute never matches the client's on first paint.
    // That specific, expected mismatch is exactly what this prop exists to
    // silence; it doesn't suppress any OTHER hydration warning.
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <VisitBeacon />
        <VersionCheckBanner />
        <SessionHealthBanner />
        <ThemeProvider>
          <AppLoader>
            {children}
          </AppLoader>
        </ThemeProvider>
      </body>
    </html>
  );
}