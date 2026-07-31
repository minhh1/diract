"use client";

// A dependency-free inline SVG chart -- this codebase has no charting
// library (recharts/chart.js/etc) anywhere, and pulling one in just for a
// handful of simple bar/line charts isn't worth the new dependency.
// Shared between the Cash Flow panel and the IC-memo print view, so both
// render identically.
import type { MonthlyCashFlow } from "@/lib/cashFlowEngine";

export default function CashFlowChart({ rows }: { rows: MonthlyCashFlow[] }) {
  if (!rows.length) return <p className="text-[11px] text-slate-400">No timed cash flow yet -- set a linked task or timing dates on your budget lines below.</p>;

  const W = 640, H = 180, PAD = 24;
  const values = rows.map(r => r.cumulative);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const range = max - min || 1;
  const xStep = rows.length > 1 ? (W - PAD * 2) / (rows.length - 1) : 0;
  const yFor = (v: number) => H - PAD - ((v - min) / range) * (H - PAD * 2);
  const xFor = (i: number) => PAD + i * xStep;
  const zeroY = yFor(0);

  const linePath = rows.map((r, i) => `${i === 0 ? "M" : "L"} ${xFor(i)} ${yFor(r.cumulative)}`).join(" ");
  const areaPath = `${linePath} L ${xFor(rows.length - 1)} ${zeroY} L ${xFor(0)} ${zeroY} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
      <line x1={PAD} y1={zeroY} x2={W - PAD} y2={zeroY} stroke="#e2e8f0" strokeWidth={1} />
      <path d={areaPath} fill="#6366f1" fillOpacity={0.1} />
      <path d={linePath} fill="none" stroke="#6366f1" strokeWidth={2} />
      {rows.map((r, i) => (
        <circle key={r.month} cx={xFor(i)} cy={yFor(r.cumulative)} r={2.5} fill={r.cumulative >= 0 ? "#10b981" : "#ef4444"} />
      ))}
      <text x={PAD} y={H - 4} className="text-[8px]" fill="#94a3b8">{rows[0].month}</text>
      <text x={W - PAD} y={H - 4} textAnchor="end" className="text-[8px]" fill="#94a3b8">{rows[rows.length - 1].month}</text>
    </svg>
  );
}
