import AppLoader from "@/components/AppLoader";
import ThemeProvider from "@/components/ThemeProvider";
import VersionCheckBanner from "@/components/VersionCheckBanner";

// Everything that needs the real signed-in app shell (dashboard, /public/*
// staff previews, the Teams/WhatsApp link-account pages) lives under this
// route group -- dark mode, the splash/bootstrap gate, and the "new version
// available" banner are all scoped to here, not the marketing/auth pages in
// app/(marketing)/ (a visitor on the homepage or login isn't mid-session in
// the app, so "refresh to get the latest build" doesn't apply to them --
// VersionCheckBanner used to sit in the root layout and show there too).
export default function AppShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <AppLoader>{children}</AppLoader>
      <VersionCheckBanner />
    </ThemeProvider>
  );
}
