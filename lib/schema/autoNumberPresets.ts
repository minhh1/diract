// lib/schema/autoNumberPresets.ts
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
