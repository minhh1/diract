"use client";

// Dependency-free inline SVG horizontal bar chart (same convention as
// CashFlowChart.tsx -- no charting library in this codebase). Draws one
// bar per sensitivity variable spanning its low->high leveraged IRR swing,
// already sorted most-impactful-first by lib/sensitivityEngine.ts, with a
// dashed reference line at the base case.
import type { TornadoResult } from "@/lib/sensitivityEngine";

export default function TornadoChart({ result }: { result: TornadoResult }) {
  const rows = result.rows.filter(r => r.lowIrrPct != null && r.highIrrPct != null);
  if (rows.length === 0) return <p className="text-[11px] text-slate-400">Not enough dated cash flow yet to compute sensitivity.</p>;

  const baseline = result.baselineIrrPct ?? 0;
  const allValues = rows.flatMap(r => [r.lowIrrPct!, r.highIrrPct!, baseline]);
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const range = max - min || 1;

  const W = 640;
  const ROW_H = 40;
  const PAD_TOP = 16;
  const PAD_BOTTOM = 16;
  const PAD_LEFT = 130;
  const PAD_RIGHT = 16;
  const H = rows.length * ROW_H + PAD_TOP + PAD_BOTTOM;
  const chartW = W - PAD_LEFT - PAD_RIGHT;

  const xFor = (v: number) => PAD_LEFT + ((v - min) / range) * chartW;
  const baseX = xFor(baseline);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
      <line x1={baseX} y1={PAD_TOP - 6} x2={baseX} y2={H - PAD_BOTTOM + 2} stroke="#94a3b8" strokeWidth={1} strokeDasharray="3,3" />
      <text x={baseX} y={H - 4} textAnchor="middle" className="text-[8px]" fill="#94a3b8">Base {baseline.toFixed(0)}%</text>
      {rows.map((row, i) => {
        const y = PAD_TOP + i * ROW_H;
        const a = row.lowIrrPct!, b = row.highIrrPct!;
        const xa = xFor(a), xb = xFor(b);
        const barX1 = Math.min(xa, xb), barX2 = Math.max(xa, xb);
        return (
          <g key={row.label}>
            <text x={PAD_LEFT - 8} y={y + 14} textAnchor="end" className="text-[9px]" fill="#475569">{row.label}</text>
            <rect x={barX1} y={y + 4} width={Math.max(1, barX2 - barX1)} height={14} fill="#6366f1" fillOpacity={0.22} stroke="#6366f1" strokeWidth={1} rx={2} />
            <text x={xa} y={y} textAnchor="middle" className="text-[8px]" fill={a >= baseline ? "#10b981" : "#ef4444"}>{a.toFixed(0)}%</text>
            <text x={xb} y={y + 30} textAnchor="middle" className="text-[8px]" fill={b >= baseline ? "#10b981" : "#ef4444"}>{b.toFixed(0)}%</text>
          </g>
        );
      })}
    </svg>
  );
}
