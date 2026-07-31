"use client";

import { useState, useEffect, useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { bucketKey } from "@/lib/dashboardWidgets/compute";
import type { ChartGranularity, ChartType } from "@/lib/dashboardWidgets/types";

interface SeriesProp {
  label: string;
  fieldType: string;
  points: { bucket: string; value: number }[];
  // See ChartSeriesConfig.axis in lib/dashboardWidgets/types.ts -- when set
  // on 2+ series, drives the axis-selector UI below instead of the plain
  // click-a-legend-item-to-hide/show behavior.
  axis?: { name: string; choice: string }[];
}

interface Props {
  series: SeriesProp[];
  granularity: ChartGranularity;
  // Undefined means 'bar', today's only look -- see ChartWidget.config's doc
  // comment in lib/dashboardWidgets/types.ts.
  chartType?: ChartType;
  // The filter bar's current value for this chart's own date field (if any)
  // -- highlights the matching bucket so it's clear which day the rest of
  // the dashboard is currently scoped to.
  selectedBucket?: string | null;
  // Clicking a bucket sets every other visible widget's date filter to that
  // bucket (see DashboardWidgetRenderer's 'chart' case) -- undefined
  // disables the interaction entirely (e.g. builder preview).
  onBucketClick?: (bucket: string) => void;
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

export default function DashboardActivityChart({ series, granularity, chartType = 'bar', selectedBucket, onBucketClick }: Props) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [hoverBucket, setHoverBucket] = useState<string | null>(null);
  // Which configured series are hidden from view -- a live legend toggle,
  // purely local/visual (doesn't affect what's fetched or other widgets).
  // Index-keyed, not label-keyed, so two series that happen to share a
  // label toggle independently. Only used when NO series carry axis tags
  // (see below) -- an axis-tagged chart is driven by `selection` instead.
  const [hiddenSeries, setHiddenSeries] = useState<Set<number>>(new Set());

  const toggleSeries = (i: number) => setHiddenSeries(prev => {
    const next = new Set(prev);
    if (next.has(i)) next.delete(i); else next.add(i);
    return next;
  });

  // Every distinct axis name across all series, each with its distinct
  // choices in first-seen (= series config) order -- e.g. [{name:'Type',
  // choices:['Billable','Non-billable']}, {name:'Metric',choices:['Hours',
  // 'Amount']}] for a 4-series Billable/Non-billable x Hours/Amount chart.
  const axes = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const s of series) {
      for (const a of s.axis || []) {
        if (!map.has(a.name)) map.set(a.name, []);
        const choices = map.get(a.name)!;
        if (!choices.includes(a.choice)) choices.push(a.choice);
      }
    }
    return Array.from(map.entries()).map(([name, choices]) => ({ name, choices }));
  }, [series]);
  const hasAxes = axes.length > 0;

  // Current choice per axis -- defaults to each axis's first-seen choice
  // (so series authoring order sets the default, e.g. put "Billable" and
  // "Hours" first to default to Billable Hours) without clobbering a
  // choice the viewer already picked, including across a `series` prop
  // change that keeps the same axis/choices.
  const [selection, setSelection] = useState<Record<string, string>>({});
  useEffect(() => {
    setSelection(prev => {
      let changed = false;
      const next = { ...prev };
      for (const axis of axes) {
        if (!next[axis.name] || !axis.choices.includes(next[axis.name])) {
          next[axis.name] = axis.choices[0];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [axes]);

  const byBucketPerSeries = useMemo(() => series.map(s => new Map(s.points.map(p => [p.bucket, p.value]))), [series]);
  const todayBucket = useMemo(() => bucketKey(today.toISOString().slice(0, 10), granularity), [granularity]); // eslint-disable-line react-hooks/exhaustive-deps

  const visibleIndexes = useMemo(() => {
    if (hasAxes) {
      return series
        .map((_, i) => i)
        .filter(i => (series[i].axis || []).every(tag => selection[tag.name] === tag.choice));
    }
    return series.map((_, i) => i).filter(i => !hiddenSeries.has(i));
  }, [series, hasAxes, selection, hiddenSeries]);

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

  const maxValue = Math.max(1, ...slots.flatMap(slot => visibleIndexes.map(i => byBucketPerSeries[i].get(slot.bucket) || 0)));

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

  // Bar-color treatment (single-hue vs categorical): an axis-tagged chart
  // always shows exactly one series at a time by construction, so it's
  // always single-hue; otherwise it's fixed by how many series are
  // CONFIGURED (not how many are currently legend-visible), so toggling one
  // off in the legend doesn't recolor the survivor.
  const isSingleSeries = hasAxes ? true : series.length === 1;

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

      {/* One toggle group per axis (e.g. Billable/Non-billable, then
          Hours/Amount) -- picking a choice on every axis narrows to exactly
          one series, so this replaces the legend entirely for a tagged
          chart. */}
      {hasAxes && (
        <div className="flex flex-wrap items-center gap-3 mb-3">
          {axes.map(axis => (
            <div key={axis.name} className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-full p-0.5">
              {axis.choices.map(choice => (
                <button
                  key={choice}
                  onClick={() => setSelection(prev => ({ ...prev, [axis.name]: choice }))}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide transition-all ${
                    selection[axis.name] === choice ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {choice}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* A legend is always present for 2+ untagged series (the dependable
          identity channel); a single series needs none -- the header
          already names it. Each entry doubles as a visibility toggle --
          click to hide/show that series. Not shown for an axis-tagged
          chart, which uses the toggle groups above instead. */}
      {!hasAxes && !isSingleSeries && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-3">
          {series.map((s, i) => {
            const isHidden = hiddenSeries.has(i);
            return (
              <button
                key={i}
                onClick={() => toggleSeries(i)}
                title={isHidden ? `Show ${s.label || 'series'}` : `Hide ${s.label || 'series'}`}
                className={`flex items-center gap-1.5 transition-opacity ${isHidden ? 'opacity-35 hover:opacity-60' : 'hover:opacity-70'}`}
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: SERIES_COLORS[i % SERIES_COLORS.length] }} />
                <span className="text-[10px] font-medium text-slate-500">{s.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {visibleIndexes.length === 0 ? (
        <div className="h-32 flex items-center justify-center text-[11px] text-slate-300 italic">
          {hasAxes ? 'No series matches this combination' : 'Every series is hidden. Click a legend item to show it'}
        </div>
      ) : (
      <div className="relative h-32">
        {/* Line/area draw once, as one SVG path per visible series, behind
            the per-slot hover/click columns below (unchanged for every
            chart type -- tooltip and "click to filter the dashboard to
            this bucket" work identically regardless of how the values are
            drawn). viewBox height 100 matches the bars' own height-percent
            math (heightPct below) so both marks agree on where 0..max
            sits; preserveAspectRatio="none" stretches the path to the
            container's actual box, same as the bars already implicitly
            do via percentage heights. */}
        {chartType !== 'bar' && (
          <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible" viewBox={`0 0 ${Math.max(1, slots.length - 1)} 100`} preserveAspectRatio="none">
            {visibleIndexes.map(i => {
              const color = isSingleSeries ? BAR_COLOR : SERIES_COLORS[i % SERIES_COLORS.length];
              const coords = slots.map((slot, idx) => {
                const value = byBucketPerSeries[i].get(slot.bucket) || 0;
                const y = 100 - Math.max(0, Math.min(100, (value / maxValue) * 100));
                return `${idx},${y}`;
              });
              const linePoints = coords.join(' ');
              return (
                <g key={i}>
                  {chartType === 'area' && (
                    <polygon points={`0,100 ${linePoints} ${slots.length - 1},100`} fill={color} fillOpacity={0.15} stroke="none" />
                  )}
                  <polyline
                    points={linePoints}
                    fill="none"
                    stroke={color}
                    strokeWidth={2}
                    vectorEffect="non-scaling-stroke"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                </g>
              );
            })}
          </svg>
        )}
      <div className="relative flex items-end gap-[3px] h-full">
        {slots.map(slot => {
          const isCurrent = slot.bucket === todayBucket;
          const isSelected = slot.bucket === selectedBucket;
          return (
            <div
              key={slot.bucket}
              className={`flex-1 h-full flex flex-col justify-end relative ${onBucketClick ? 'cursor-pointer' : ''}`}
              onMouseEnter={() => setHoverBucket(slot.bucket)}
              onMouseLeave={() => setHoverBucket(prev => (prev === slot.bucket ? null : prev))}
              onClick={onBucketClick ? () => onBucketClick(slot.bucket) : undefined}
            >
              {hoverBucket === slot.bucket && (
                <div className="absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 px-2.5 py-1.5 bg-slate-900 text-white text-[10px] font-bold rounded-lg whitespace-nowrap z-10 shadow-lg space-y-0.5">
                  {visibleIndexes.map(i => {
                    const s = series[i];
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
              {/* Selected (filtered-to) bucket gets a firm accent backdrop;
                  "today" gets a lighter one when nothing's selected -- the two
                  never compete since a selection is a deliberate, stronger
                  signal than the ambient "now" marker. */}
              {isSelected ? (
                <div className="absolute inset-y-0 left-0 right-0 bg-indigo-100/80 rounded pointer-events-none" />
              ) : (!isSingleSeries && isCurrent) && (
                <div className="absolute inset-y-0 left-0 right-0 bg-slate-100/70 rounded pointer-events-none" />
              )}
              {chartType === 'bar' && (
                <div className="relative flex items-end justify-center gap-[2px] h-full w-full">
                  {series.map((s, i) => {
                    if (!visibleIndexes.includes(i)) return null;
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
              )}
            </div>
          );
        })}
      </div>
      </div>
      )}

      <div className="flex gap-[3px] mt-1.5">
        {slots.map(slot => (
          <div key={slot.bucket} className="flex-1 text-center">
            <span className={`text-[8px] ${slot.bucket === selectedBucket ? 'font-bold text-indigo-600' : slot.bucket === todayBucket ? 'font-bold text-slate-700' : 'text-slate-300'}`}>
              {slot.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
