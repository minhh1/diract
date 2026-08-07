import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Polygon, Polyline } from 'react-native-svg';

import { useTheme } from '@/hooks/use-theme';
import { bucketKey } from '@/lib/dashboardWidgets/compute';
import type { ChartGranularity, ChartType } from '@/lib/dashboardWidgets/types';
import type { ChartSeriesResult } from '@/lib/dashboardWidgets/compute';

// Simplified native port of components/dashboard/DashboardActivityChart.tsx.
// Deliberately drops three things the web version has: the day-granularity
// month pager (always shows the last 12 buckets instead, for every
// granularity uniformly), hover tooltips (no hover on a touch device --
// tapping a bar/point instead shows its value in a small strip below the
// chart), and the axis-tag toggle-group selector for a multi-series chart
// tagged like Billable/Non-billable x Hours/Amount (falls back to the
// flat, always-visible legend every OTHER multi-series chart already uses).
// Bar/line/area drawing itself, and computeChartSeries's underlying
// aggregate math, are the same as web -- see compute.ts's own header
// comment on why that file is a verbatim copy.
const SERIES_COLORS = ['#2a78d6', '#008300', '#e87ba4', '#eda100', '#1baf7a', '#eb6834', '#4a3aa7', '#e34948'];

function formatBucketLabel(bucket: string, granularity: ChartGranularity): string {
  const d = new Date(`${bucket}T00:00:00`);
  if (granularity === 'month') return d.toLocaleDateString('en-AU', { month: 'short', year: '2-digit' });
  if (granularity === 'week') return d.toLocaleDateString('en-AU', { month: 'short', day: 'numeric' });
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

function formatValue(v: number, fieldType: string): string {
  return fieldType === 'currency'
    ? `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
    : v.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

const CHART_HEIGHT = 140;

export function DashboardActivityChart({
  series,
  granularity,
  chartType = 'bar',
}: {
  series: ChartSeriesResult[];
  granularity: ChartGranularity;
  chartType?: ChartType;
}) {
  const theme = useTheme();
  const [hiddenSeries, setHiddenSeries] = useState<Set<number>>(new Set());
  const [tappedBucket, setTappedBucket] = useState<string | null>(null);

  const visibleIndexes = series.map((_, i) => i).filter((i) => !hiddenSeries.has(i));
  const isSingleSeries = series.length === 1;

  const byBucketPerSeries = useMemo(() => series.map((s) => new Map(s.points.map((p) => [p.bucket, p.value]))), [series]);
  const todayBucket = useMemo(() => bucketKey(new Date().toISOString().slice(0, 10), granularity), [granularity]);

  const slots = useMemo(() => {
    const allBuckets = new Set<string>();
    for (const m of byBucketPerSeries) for (const b of m.keys()) allBuckets.add(b);
    return Array.from(allBuckets)
      .sort()
      .slice(-12)
      .map((bucket) => ({ bucket, label: formatBucketLabel(bucket, granularity) }));
  }, [byBucketPerSeries, granularity]);

  const maxValue = Math.max(1, ...slots.flatMap((slot) => visibleIndexes.map((i) => byBucketPerSeries[i].get(slot.bucket) || 0)));

  const toggleSeries = (i: number) =>
    setHiddenSeries((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  if (visibleIndexes.length === 0) {
    return (
      <Text style={{ color: theme.textSecondary, fontStyle: 'italic', fontSize: 12, textAlign: 'center', paddingVertical: 20 }}>
        Every series is hidden. Tap a legend item to show it.
      </Text>
    );
  }

  // Distinct from "every series hidden" above -- this is no bucket having
  // any data at all yet (e.g. every record's date field is empty), found
  // live testing a fresh dashboard whose one record hadn't been dated yet:
  // the bar/line row rendered as a blank box with no explanation.
  if (slots.length === 0) {
    return (
      <Text style={{ color: theme.textSecondary, fontStyle: 'italic', fontSize: 12, textAlign: 'center', paddingVertical: 20 }}>
        No dated records yet.
      </Text>
    );
  }

  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      {!isSingleSeries && (
        <View style={styles.legend}>
          {series.map((s, i) => {
            const isHidden = hiddenSeries.has(i);
            return (
              <Pressable key={i} onPress={() => toggleSeries(i)} style={[styles.legendItem, { opacity: isHidden ? 0.4 : 1 }]}>
                <View style={[styles.legendDot, { backgroundColor: SERIES_COLORS[i % SERIES_COLORS.length] }]} />
                <Text style={{ color: theme.textSecondary, fontSize: 10, fontWeight: '600' }}>{s.label}</Text>
              </Pressable>
            );
          })}
        </View>
      )}

      <View style={{ height: CHART_HEIGHT }}>
        {chartType !== 'bar' && (
          <Svg style={StyleSheet.absoluteFill} viewBox={`0 0 ${Math.max(1, slots.length - 1)} 100`} preserveAspectRatio="none">
            {visibleIndexes.map((i) => {
              const color = isSingleSeries ? theme.accent : SERIES_COLORS[i % SERIES_COLORS.length];
              const coords = slots.map((slot, idx) => {
                const value = byBucketPerSeries[i].get(slot.bucket) || 0;
                const y = 100 - Math.max(0, Math.min(100, (value / maxValue) * 100));
                return `${idx},${y}`;
              });
              const linePoints = coords.join(' ');
              return (
                <View key={i}>
                  {chartType === 'area' && (
                    <Polygon points={`0,100 ${linePoints} ${slots.length - 1},100`} fill={color} fillOpacity={0.15} stroke="none" />
                  )}
                  <Polyline points={linePoints} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
                </View>
              );
            })}
          </Svg>
        )}

        {chartType === 'bar' && (
          <View style={styles.barRow}>
            {slots.map((slot) => {
              const isCurrent = slot.bucket === todayBucket;
              return (
                <Pressable key={slot.bucket} onPress={() => setTappedBucket((b) => (b === slot.bucket ? null : slot.bucket))} style={styles.barSlot}>
                  {isCurrent && !isSingleSeries && <View style={[styles.currentBucketBg, { backgroundColor: theme.backgroundSelected }]} />}
                  <View style={styles.barGroup}>
                    {series.map((_, i) => {
                      if (!visibleIndexes.includes(i)) return null;
                      const value = byBucketPerSeries[i].get(slot.bucket) || 0;
                      const heightPct = Math.max(2, (value / maxValue) * 100);
                      const color = value <= 0 ? theme.border : isSingleSeries ? theme.accent : SERIES_COLORS[i % SERIES_COLORS.length];
                      return <View key={i} style={[styles.bar, { height: `${heightPct}%`, backgroundColor: color }]} />;
                    })}
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}

        {chartType !== 'bar' && (
          // Invisible tap targets over the line/area chart, same slot layout
          // as the bar case, so tapping a point works identically.
          <View style={[styles.barRow, StyleSheet.absoluteFill]}>
            {slots.map((slot) => (
              <Pressable key={slot.bucket} onPress={() => setTappedBucket((b) => (b === slot.bucket ? null : slot.bucket))} style={styles.barSlot} />
            ))}
          </View>
        )}
      </View>

      <View style={styles.labelRow}>
        {slots.map((slot) => (
          <Text key={slot.bucket} numberOfLines={1} style={[styles.slotLabel, { color: slot.bucket === todayBucket ? theme.text : theme.textSecondary }]}>
            {slot.label}
          </Text>
        ))}
      </View>

      {tappedBucket && (
        <View style={[styles.tooltip, { borderColor: theme.border, backgroundColor: theme.backgroundSelected }]}>
          {visibleIndexes.map((i) => {
            const s = series[i];
            const value = byBucketPerSeries[i].get(tappedBucket) || 0;
            return (
              <View key={i} style={styles.tooltipRow}>
                {!isSingleSeries && <View style={[styles.legendDot, { backgroundColor: SERIES_COLORS[i % SERIES_COLORS.length] }]} />}
                <Text style={{ color: theme.text, fontSize: 12, fontWeight: '600' }}>
                  {formatBucketLabel(tappedBucket, granularity)}: {formatValue(value, s.fieldType)} {s.label || 'value'}
                </Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 14, borderRadius: 16, borderWidth: 1 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 7, height: 7, borderRadius: 4 },
  barRow: { flexDirection: 'row', alignItems: 'flex-end', height: '100%', gap: 3 },
  barSlot: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  currentBucketBg: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 4 },
  barGroup: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 2, height: '100%' },
  bar: { flex: 1, maxWidth: 18, borderTopLeftRadius: 3, borderTopRightRadius: 3, minHeight: 2 },
  labelRow: { flexDirection: 'row', gap: 3, marginTop: 6 },
  slotLabel: { flex: 1, fontSize: 8, textAlign: 'center' },
  tooltip: { marginTop: 10, padding: 10, borderRadius: 12, borderWidth: 1, gap: 4 },
  tooltipRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
