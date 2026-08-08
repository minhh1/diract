import QueryProvider from "@/components/QueryProvider";
import { CompanyProvider } from "@/components/CompanyContext";
import { ProgressBarProvider } from "@/components/TopProgressBar";
import PerfRouteTracker from "@/components/PerfRouteTracker";
import BackgroundTasksTray from "@/components/BackgroundTasksTray";
import KioskAppShell from "@/components/KioskAppShell";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      <CompanyProvider>
        <ProgressBarProvider>
          <PerfRouteTracker />
          <BackgroundTasksTray />
          {/* KioskAppShell reads role from CompanyContext and switches
              between the normal Sidebar shell and the restricted kiosk
              shell -- see that component's own doc comment. */}
          <KioskAppShell>{children}</KioskAppShell>
        </ProgressBarProvider>
      </CompanyProvider>
    </QueryProvider>
  );
}
