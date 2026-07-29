// app/layout.tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import AppLoader from "@/components/AppLoader";
import VisitBeacon from "@/components/VisitBeacon";
import VersionCheckBanner from "@/components/VersionCheckBanner";
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
    <html lang="en">
      <body className={inter.className}>
        <VisitBeacon />
        <VersionCheckBanner />
        <AppLoader>
          {children}
        </AppLoader>
      </body>
    </html>
  );
}