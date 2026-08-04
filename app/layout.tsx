// app/layout.tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import VisitBeacon from "@/components/VisitBeacon";
import VersionCheckBanner from "@/components/VersionCheckBanner";
import SessionHealthBanner from "@/components/SessionHealthBanner";
import { BUILD_ID } from "@/lib/buildId";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Diract",
  description: "The configurable CRM platform for your tables and processes",
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
    // suppressHydrationWarning -- next-themes (mounted only inside
    // app/(app)/layout.tsx now, not here) sets the `dark`/`light` class on
    // this element via an inline script that runs before React hydrates,
    // which means the server-rendered class attribute never matches the
    // client's on first paint for THAT route group. Kept here too since
    // this element is shared by every route regardless of group.
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <VisitBeacon />
        <VersionCheckBanner />
        <SessionHealthBanner />
        {children}
      </body>
    </html>
  );
}