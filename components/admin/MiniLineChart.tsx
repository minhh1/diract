// components/admin/MiniLineChart.tsx
// Single-hue sequential line chart (magnitude over time) for the Platform
// Health tab's Analytics/Costs sub-tabs -- one series never needs a legend
// (the chart's own title names it), so this deliberately doesn't render one.
// Thin 2px line, rounded data-end anchored to the baseline, recessive
// gridline, hover crosshair + tooltip.
"use client";

import { useState, useRef } from "react";

interface Point {
  label: string; // e.g. an ISO date
  value: number;
}

const LINE_COLOR = "#4f46e5"; // indigo-600, matches this app's existing accent usage
const WIDTH = 600;
const HEIGHT = 160;
const PAD_X = 8;
const PAD_TOP = 12;
const PAD_BOTTOM = 24;

export default function MiniLineChart({ data, valueLabel }: { data: Point[]; valueLabel: string }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  if (data.length === 0) {
    return <p className="text-[11px] text-slate-300 text-center py-10">No data yet</p>;
  }

  const maxValue = Math.max(1, ...data.map(d => d.value));
  const innerWidth = WIDTH - PAD_X * 2;
  const innerHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const stepX = data.length > 1 ? innerWidth / (data.length - 1) : 0;

  const points = data.map((d, i) => ({
    x: PAD_X + i * stepX,
    y: PAD_TOP + innerHeight - (d.value / maxValue) * innerHeight,
    ...d,
  }));

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const hovered = hoverIdx !== null ? points[hoverIdx] : null;

  const handleMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const relX = ((e.clientX - rect.left) / rect.width) * WIDTH;
    const idx = Math.round((relX - PAD_X) / (stepX || 1));
    setHoverIdx(Math.max(0, Math.min(data.length - 1, idx)));
  };

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full h-40"
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        {/* Recessive baseline */}
        <line x1={PAD_X} y1={PAD_TOP + innerHeight} x2={WIDTH - PAD_X} y2={PAD_TOP + innerHeight} stroke="#e2e8f0" strokeWidth={1} />

        <path d={path} fill="none" stroke={LINE_COLOR} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

        {/* Rounded data-end on the last point */}
        <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r={4} fill={LINE_COLOR} />

        {hovered && (
          <>
            <line x1={hovered.x} y1={PAD_TOP} x2={hovered.x} y2={PAD_TOP + innerHeight} stroke="#cbd5e1" strokeWidth={1} strokeDasharray="3,3" />
            <circle cx={hovered.x} cy={hovered.y} r={4} fill={LINE_COLOR} stroke="white" strokeWidth={1.5} />
          </>
        )}

        <text x={PAD_X} y={HEIGHT - 6} fontSize={9} fill="#94a3b8">{data[0].label}</text>
        <text x={WIDTH - PAD_X} y={HEIGHT - 6} fontSize={9} fill="#94a3b8" textAnchor="end">{data[data.length - 1].label}</text>
      </svg>

      {hovered && (
        <div
          className="absolute top-0 -translate-x-1/2 bg-slate-900 text-white text-[10px] font-bold px-2.5 py-1.5 rounded-lg pointer-events-none whitespace-nowrap"
          style={{ left: `${(hovered.x / WIDTH) * 100}%` }}
        >
          {hovered.label}: {hovered.value.toLocaleString()} {valueLabel}
        </div>
      )}
    </div>
  );
}
