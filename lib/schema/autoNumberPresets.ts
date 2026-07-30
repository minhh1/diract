// lib/schema/autoNumberPresets.ts
import { supabase } from "@/lib/supabase";
// Shared preset list + helpers for the "Auto numbering" config UI, used by
// both components/schema/FieldConfigPanel.tsx (the full schema/custom-
// fields config panel) and components/dashboard/FieldAutoNumberPopover.tsx
// (the quick inline toggle next to a field in Record Dashboard's edit-layout
// mode) -- one shared place so the two never drift on what a preset means.
// Backs company_table_fields.auto_number_prefix/_start/_pad (custom
// tables) and company_custom_fields' identically-named/shaped columns
// (system tables -- see supabase/migrations/
// 20260730180000_custom_field_auto_numbering.sql).
export interface AutoNumberConfigValue {
  prefix: string | null;
  start: number | null;
  pad: number | null;
}

export const AUTO_NUMBER_PRESETS = [
  { v: 'plain',    label: 'Sequential — 1, 2, 3…',              prefix: '',        pad: 1 },
  { v: 'padded',   label: 'Padded number — 000001',             prefix: '',        pad: 6 },
  { v: 'year',     label: 'Year code — 260001 (yy + counter)',  prefix: '{YY}',    pad: 4 },
  { v: 'fullyear', label: 'Full year — 2026-0001',              prefix: '{YYYY}-', pad: 4 },
  { v: 'prefixed', label: 'Prefix — LD-0001',                   prefix: 'LD-',     pad: 4 },
];

export function detectAutoNumberPreset(v: AutoNumberConfigValue): string {
  if (v.prefix == null) return 'off';
  const pad = v.pad ?? 6;
  const match = AUTO_NUMBER_PRESETS.find(p => p.prefix === v.prefix && p.pad === pad);
  return match ? match.v : 'custom';
}

export function autoNumberExample(v: AutoNumberConfigValue): string {
  const now = new Date();
  const prefix = (v.prefix || '')
    .replace('{YYYY}', String(now.getFullYear()))
    .replace('{YY}', String(now.getFullYear()).slice(-2))
    .replace('{MM}', String(now.getMonth() + 1).padStart(2, '0'));
  const n = String(v.start ?? 1);
  return prefix + n.padStart(Math.max(v.pad ?? 6, n.length), '0');
}

// Applies a preset selection to a value -- 'off' clears it, a real preset
// sets prefix+pad (leaving start untouched), 'custom' just ensures
// numbering is switched on without changing whatever's already there.
export function applyAutoNumberPreset(current: AutoNumberConfigValue, presetKey: string): AutoNumberConfigValue {
  if (presetKey === 'off') return { ...current, prefix: null };
  const preset = AUTO_NUMBER_PRESETS.find(p => p.v === presetKey);
  if (!preset) return current.prefix == null ? { ...current, prefix: '' } : current;
  return { ...current, prefix: preset.prefix, pad: preset.pad };
}

// Parses the highest number already stored under a plain-int-parseable
// prefix (i.e. ignores the {YY}/{YYYY}/{MM} date tokens -- there's no
// single well-defined "latest" across a value that includes a token that
// changes over time) -- returns null when there's nothing to continue from,
// so the caller can leave `start` as-is rather than resetting it to zero.
export function parseHighestAssignedNumber(values: string[], prefix: string): number | null {
  let max: number | null = null;
  for (const raw of values) {
    if (!raw.startsWith(prefix)) continue;
    const rest = raw.slice(prefix.length);
    if (!/^\d+$/.test(rest)) continue; // not a plain zero-padded counter -- e.g. leftover free-typed text
    const n = parseInt(rest, 10);
    if (max === null || n > max) max = n;
  }
  return max;
}

// Which table a field's records actually live in -- a system-table field
// (e.g. Matter Number on projects) vs. a field on an ordinary custom table,
// where every record (regardless of which custom table) shares one
// company_table_records row, disambiguated by table_id.
export type AutoNumberParentTable =
  | { kind: 'system'; table: string }
  | { kind: 'custom'; tableId: string };

// "Continue from latest" needs the highest number ALREADY ASSIGNED to a
// still-live record -- a deleted/archived one shouldn't count (this app's
// "Archive this record?" action just sets deleted_at, same as any other
// soft delete -- see RecordDashboard.tsx -- so there's only one state to
// exclude here, not two). Two-step query rather than one embedded-resource
// filter: company_custom_field_values/company_table_values has no declared
// FK PostgREST can use for dot-notation filtering (deliberately -- it's a
// generic EAV table reused across every table_name), so the set of live
// record ids has to be fetched separately and intersected in memory.
export async function fetchHighestAssignedNumber(
  fieldId: string,
  prefix: string,
  valueTable: 'company_custom_field_values' | 'company_table_values',
  parent: AutoNumberParentTable
): Promise<number | null> {
  const liveIds = new Set<string>();
  if (parent.kind === 'system') {
    const { data } = await supabase.from(parent.table).select('id').is('deleted_at', null);
    (data || []).forEach((r: { id: string }) => liveIds.add(r.id));
  } else {
    const { data } = await supabase.from('company_table_records').select('id').eq('table_id', parent.tableId).is('deleted_at', null);
    (data || []).forEach((r: { id: string }) => liveIds.add(r.id));
  }
  if (!liveIds.size) return null;

  const { data: values } = await supabase.from(valueTable).select('record_id, value_text').eq('field_id', fieldId);
  const liveValues = (values || [])
    .filter((v: { record_id: string }) => liveIds.has(v.record_id))
    .map((v: { value_text: string | null }) => v.value_text)
    .filter((v: string | null): v is string => !!v);
  return parseHighestAssignedNumber(liveValues, prefix);
}
