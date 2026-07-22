"use client";

import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { bucketKey } from "@/lib/dashboardWidgets/compute";
import type { ChartGranularity } from "@/lib/dashboardWidgets/types";

interface SeriesProp {
  label: string;
  fieldType: string;
  points: { bucket: string; value: number }[];
}

interface Props {
  series: SeriesProp[];
  granularity: ChartGranularity;
}

// Sequential single-hue treatment for the 1-series case (unchanged from
// before multi-series support -- per the dataviz skill, one hue for
// magnitude, no legend needed, current day/bucket highlighted with a
// darker step of the same ramp). Hue steps are the skill's validated
// default sequential blue ramp (references/palette.md).
const BAR_COLOR = '#3987e5';   // step 400
const TODAY_COLOR = '#184f95'; // step 600
const TRACK_COLOR = '#eef2f7';

// Light-mode categorical order from the dataviz skill's validated default
// palette (references/palette.md) -- this app has no dark mode, so only
// the light column is used. Assigned by series index, fixed order, never
// cycled/re-derived. The config panel soft-caps at 8 series to match.
const SERIES_COLORS = ['#2a78d6', '#008300', '#e87ba4', '#eda100', '#1baf7a', '#eb6834', '#4a3aa7', '#e34948'];

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function formatBucketLabel(bucket: string, granularity: ChartGranularity): string {
  const d = new Date(`${bucket}T00:00:00`);
  if (granularity === 'month') return d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
  if (granularity === 'week') return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return String(d.getDate());
}

function formatValue(v: number, fieldType: string): string {
  return fieldType === 'currency'
    ? `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
    : v.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export default function DashboardActivityChart({ series, granularity }: Props) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [hoverBucket, setHoverBucket] = useState<string | null>(null);

  const byBucketPerSeries = useMemo(() => series.map(s => new Map(s.points.map(p => [p.bucket, p.value]))), [series]);
  const todayBucket = useMemo(() => bucketKey(today.toISOString().slice(0, 10), granularity), [granularity]); // eslint-disable-line react-hooks/exhaustive-deps

  // day: the existing month-by-month pager, unchanged, just N sub-bars per
  // slot instead of 1. week/month: no pager -- a flat rolling window of the
  // last 12 buckets any series has data for, sorted ascending, so bars for
  // every series line up in the same slot even when one series has no data
  // for a given bucket (treated as 0).
  const slots = useMemo(() => {
    if (granularity === 'day') {
      const dayCount = daysInMonth(year, month);
      const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}-`;
      return Array.from({ length: dayCount }, (_, i) => {
        const bucket = `${monthPrefix}${String(i + 1).padStart(2, '0')}`;
        return { bucket, label: String(i + 1) };
      });
    }
    const allBuckets = new Set<string>();
    for (const m of byBucketPerSeries) for (const b of m.keys()) allBuckets.add(b);
    return Array.from(allBuckets).sort().slice(-12).map(bucket => ({ bucket, label: formatBucketLabel(bucket, granularity) }));
  }, [granularity, year, month, byBucketPerSeries]);

  const maxValue = Math.max(1, ...slots.flatMap(slot => byBucketPerSeries.map(m => m.get(slot.bucket) || 0)));

  const changeMonth = (delta: number) => {
    let m = month + delta;
    let y = year;
    if (m < 0) { m = 11; y -= 1; }
    if (m > 11) { m = 0; y += 1; }
    setMonth(m); setYear(y);
  };

  const headerLabel = granularity === 'day'
    ? new Date(year, month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) + ' activity'
    : `Last 12 ${granularity === 'week' ? 'weeks' : 'months'}`;

  const isSingleSeries = series.length === 1;

  return (
    <div className="p-4 bg-white border border-slate-200 rounded-2xl">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] font-bold text-slate-600">{headerLabel}</p>
        {granularity === 'day' && (
          <div className="flex items-center gap-1">
            <button onClick={() => changeMonth(-1)} className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-50 rounded-full transition-colors">
              <ChevronLeft size={14} />
            </button>
            <button onClick={() => changeMonth(1)} className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-50 rounded-full transition-colors">
              <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>

      {/* A legend is always present for 2+ series (the dependable identity
          channel); a single series needs none -- the header already names it. */}
      {!isSingleSeries && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-3">
          {series.map((s, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: SERIES_COLORS[i % SERIES_COLORS.length] }} />
              <span className="text-[10px] font-medium text-slate-500">{s.label}</span>
            </div>
          ))}
        </div>
      )}

      <div className="relative flex items-end gap-[3px] h-32">
        {slots.map(slot => {
          const isCurrent = slot.bucket === todayBucket;
          return (
            <div
              key={slot.bucket}
              className="flex-1 h-full flex flex-col justify-end relative"
              onMouseEnter={() => setHoverBucket(slot.bucket)}
              onMouseLeave={() => setHoverBucket(prev => (prev === slot.bucket ? null : prev))}
            >
              {hoverBucket === slot.bucket && (
                <div className="absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 px-2.5 py-1.5 bg-slate-900 text-white text-[10px] font-bold rounded-lg whitespace-nowrap z-10 shadow-lg space-y-0.5">
                  {series.map((s, i) => {
                    const value = byBucketPerSeries[i].get(slot.bucket) || 0;
                    return (
                      <div key={i} className="flex items-center gap-1.5">
                        {!isSingleSeries && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: SERIES_COLORS[i % SERIES_COLORS.length] }} />}
                        <span>{formatValue(value, s.fieldType)} {s.label || 'value'}</span>
                      </div>
                    );
                  })}
                </div>
              )}
              {/* 2+ series: a light vertical guide marks "now" instead of
                  recoloring a bar -- shading one series' bar would overload
                  the hue channel and read as a data error, not emphasis. */}
              {!isSingleSeries && isCurrent && (
                <div className="absolute inset-y-0 left-0 right-0 bg-slate-100/70 rounded pointer-events-none" />
              )}
              <div className="relative flex items-end justify-center gap-[2px] h-full w-full">
                {series.map((s, i) => {
                  const value = byBucketPerSeries[i].get(slot.bucket) || 0;
                  const heightPct = Math.max(2, (value / maxValue) * 100);
                  const color = isSingleSeries
                    ? (value > 0 ? (isCurrent ? TODAY_COLOR : BAR_COLOR) : TRACK_COLOR)
                    : (value > 0 ? SERIES_COLORS[i % SERIES_COLORS.length] : TRACK_COLOR);
                  return (
                    <div
                      key={i}
                      className="flex-1 max-w-[24px] rounded-t transition-all"
                      style={{ height: `${heightPct}%`, backgroundColor: color, minHeight: 2 }}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex gap-[3px] mt-1.5">
        {slots.map(slot => (
          <div key={slot.bucket} className="flex-1 text-center">
            <span className={`text-[8px] ${slot.bucket === todayBucket ? 'font-bold text-slate-700' : 'text-slate-300'}`}>
              {slot.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
