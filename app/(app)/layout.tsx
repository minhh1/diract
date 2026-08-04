import AppLoader from "@/components/AppLoader";
import ThemeProvider from "@/components/ThemeProvider";

// Everything that needs the real signed-in app shell (dashboard, /public/*
// staff previews, the Teams/WhatsApp link-account pages) lives under this
// route group -- dark mode and the splash/bootstrap gate are scoped to
// here, not the marketing/auth pages in app/(marketing)/.
export default function AppShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <AppLoader>{children}</AppLoader>
    </ThemeProvider>
  );
}
