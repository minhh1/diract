import Sidebar from "@/components/Sidebar";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen w-full bg-slate-50 overflow-hidden">
      {/* COLUMN 1: Sidebar (Small) */}
      <aside className="w-[280px] h-full flex-shrink-0 border-r border-slate-200 bg-white">
        <Sidebar />
      </aside>

      {/* COLUMN 2: Main Dashboard (Large) */}
      <main className="flex-1 flex flex-col h-full overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  );
}