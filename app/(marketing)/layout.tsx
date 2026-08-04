// Landing, login, privacy/terms, and the /for/[audience] pages live under
// this group -- deliberately no ThemeProvider (so dark mode never applies
// here) and no AppLoader (no splash/bootstrap gate for logged-out
// visitors). See app/(app)/layout.tsx for the counterpart that DOES need
// both.
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
