"use client";

// Plain CSS-grid positioning for a dashboard's widgets -- used by the view
// page and the Code editor's preview pane. Deliberately has no
// react-grid-layout dependency (that's CanvasEditor.tsx's job, and only
// there) so normal dashboard viewing never loads it. Row height (40px) and
// column count (12) match CanvasEditor's own <GridLayout cols={12} rowHeight={40}>
// so switching between the interactive canvas and this static view doesn't
// visibly reflow.
import type { DashboardWidget } from "@/lib/dashboardWidgets/types";

const ROW_HEIGHT = 40;
const GAP = 12;

interface Props {
  widgets: DashboardWidget[];
  children: (widget: DashboardWidget) => React.ReactNode;
}

export default function StaticWidgetGrid({ widgets, children }: Props) {
  if (widgets.length === 0) {
    return <p className="text-center text-[11px] text-slate-300 italic py-12">This dashboard has no widgets yet</p>;
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(12, 1fr)',
        gridAutoRows: `${ROW_HEIGHT}px`,
        gap: GAP,
      }}
    >
      {widgets.map(w => (
        <div
          key={w.id}
          style={{
            gridColumn: `${w.layout.x + 1} / span ${w.layout.w}`,
            gridRow: `${w.layout.y + 1} / span ${w.layout.h}`,
            minWidth: 0,
          }}
        >
          {children(w)}
        </div>
      ))}
    </div>
  );
}
