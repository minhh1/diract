import { useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { ChevronDown } from 'lucide-react-native';

import { Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { RelationPickerSheet } from '@/components/records/RelationPickerSheet';
import { RELATIVE_DATE_RANGES, RELATIVE_DATE_LABELS, relativeDateFromToken, toRelativeDateToken, matchesRelativeDate } from '@/lib/dashboardWidgets/relativeDates';
import type { CustomTableField } from '@/lib/dashboardWidgets/customTableTypes';

const RELATION_FIELD_TYPES = new Set(['entity', 'project', 'property', 'table_relation']);

// A small "pick one from a list" modal shared by the date-preset, select,
// and boolean controls below -- date/select/boolean all reduce to the same
// interaction (see web's DashboardFilterBar, which renders them as plain
// <select>s), just with a different option list per field type.
function OptionSheet({
  visible, title, options, onSelect, onClose,
}: {
  visible: boolean;
  title: string;
  options: { label: string; value: string | null }[];
  onSelect: (value: string | null) => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <View style={[styles.sheet, { backgroundColor: theme.backgroundElement }]}>
          <Text style={[styles.sheetTitle, { color: theme.textSecondary }]}>{title}</Text>
          {options.map((opt) => (
            <Pressable
              key={opt.label}
              onPress={() => { onSelect(opt.value); onClose(); }}
              style={[styles.sheetRow, { borderColor: theme.border }]}
            >
              <Text style={{ color: theme.text, fontSize: 15, fontWeight: '600' }}>{opt.label}</Text>
            </Pressable>
          ))}
        </View>
      </Pressable>
    </Modal>
  );
}

function FilterPill({ label, value, onPress }: { label: string; value: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable onPress={onPress} style={[styles.pill, { backgroundColor: theme.background, borderColor: theme.border }]}>
      <Text numberOfLines={1} style={{ color: theme.text, fontSize: 13, fontWeight: '600', flexShrink: 1 }}>
        <Text style={{ color: theme.textSecondary, fontWeight: '700' }}>{label}: </Text>
        {value}
      </Text>
      <ChevronDown size={14} color={theme.textSecondary} />
    </Pressable>
  );
}

function DateFilterPill({ value, onChange }: { value: any; onChange: (v: string | null) => void }) {
  const theme = useTheme();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const range = relativeDateFromToken(value);
  const isCustom = !!value && !range;
  const label = range ? RELATIVE_DATE_LABELS[range] : isCustom ? new Date(value).toLocaleDateString('en-AU') : 'All';

  return (
    <>
      <FilterPill label="Date" value={label} onPress={() => setSheetOpen(true)} />
      <OptionSheet
        visible={sheetOpen}
        title="Date"
        onClose={() => setSheetOpen(false)}
        onSelect={(v) => {
          if (v === '__custom__') { setPickerOpen(true); return; }
          onChange(v);
        }}
        options={[
          { label: 'All', value: null },
          ...RELATIVE_DATE_RANGES.filter((r) => ['today', 'this_week', 'this_month'].includes(r)).map((r) => ({ label: RELATIVE_DATE_LABELS[r], value: toRelativeDateToken(r) })),
          { label: 'Custom date...', value: '__custom__' },
        ]}
      />
      {pickerOpen && (
        <DateTimePicker
          value={isCustom ? new Date(value) : new Date()}
          mode="date"
          onChange={(_event, selected) => {
            setPickerOpen(false);
            if (selected) onChange(selected.toISOString().slice(0, 10));
          }}
        />
      )}
    </>
  );
}

function SelectFilterPill({ field, value, onChange }: { field: CustomTableField & { select_options?: string[] | null }; value: any; onChange: (v: string | null) => void }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  return (
    <>
      <FilterPill label={field.label} value={value || 'All'} onPress={() => setSheetOpen(true)} />
      <OptionSheet
        visible={sheetOpen}
        title={field.label}
        onClose={() => setSheetOpen(false)}
        onSelect={onChange}
        options={[{ label: 'All', value: null }, ...(field.select_options ?? []).map((opt) => ({ label: opt, value: opt }))]}
      />
    </>
  );
}

function BooleanFilterPill({ field, value, onChange }: { field: CustomTableField; value: any; onChange: (v: string | null) => void }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const label = value === 'true' ? 'Yes' : value === 'false' ? 'No' : 'All';
  return (
    <>
      <FilterPill label={field.label} value={label} onPress={() => setSheetOpen(true)} />
      <OptionSheet
        visible={sheetOpen}
        title={field.label}
        onClose={() => setSheetOpen(false)}
        onSelect={onChange}
        options={[{ label: 'All', value: null }, { label: 'Yes', value: 'true' }, { label: 'No', value: 'false' }]}
      />
    </>
  );
}

function RelationFilterPill({
  field, value, onChange,
}: {
  field: CustomTableField & { relationSystemTable?: string | null; relationCustomTableId?: string | null; relationDisplayColumn?: string | null };
  value: any;
  onChange: (v: string | null) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const table = field.relationSystemTable ?? null;
  const displayColumn = field.relationDisplayColumn || 'name';
  // A custom-table relation target (relationCustomTableId, not a literal
  // queryable table) isn't supported as a filter yet -- same v1 gap as
  // RelationPickerSheet.tsx's own table param, which needs a real table
  // name. Falls back to a disabled-looking "All" pill rather than crashing.
  if (!table) return <FilterPill label={field.label} value="All" onPress={() => {}} />;
  return (
    <>
      <FilterPill label={field.label} value={value ? '1 selected' : 'All'} onPress={() => setPickerOpen(true)} />
      <RelationPickerSheet
        visible={pickerOpen}
        table={table}
        displayColumn={displayColumn}
        onClose={() => setPickerOpen(false)}
        onSelect={(option) => { onChange(option.id); setPickerOpen(false); }}
      />
    </>
  );
}

// Native port of components/dashboard/DashboardFilterBar.tsx -- v1 gaps
// vs the web version: no drag-to-reorder (admin-only builder feature, not
// relevant to a view-only mobile screen), no $team_scope/$current_user
// auto-narrowing or "set as my default view" (a relation filter here
// always starts on "All" and the viewer narrows it manually), no "Blank"
// option on boolean filters, no free-text/number filter control (rare in
// practice -- every filter_bar seen so far uses date/select/boolean/
// relation fields). Matching semantics otherwise: a date field's value can
// be a relative-range token ("$this_week") or a literal 'YYYY-MM-DD', and
// every other type does a plain String(value) === String(filterValue)
// match -- see relativeDates.ts and this file's exported matchesFilterValue.
export function DashboardFilterBar({
  fields, filterFieldIds, filters, onFilterChange,
}: {
  fields: CustomTableField[];
  filterFieldIds: string[];
  filters: Record<string, any>;
  onFilterChange: (fieldId: string, value: any) => void;
}) {
  const filterFields = filterFieldIds.map((id) => fields.find((f) => f.id === id)).filter((f): f is CustomTableField => !!f);
  if (filterFields.length === 0) return null;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {filterFields.map((field) => {
        const value = filters[field.id];
        const onChange = (v: string | null) => onFilterChange(field.id, v);
        if (field.field_type === 'date') return <DateFilterPill key={field.id} value={value} onChange={onChange} />;
        if (RELATION_FIELD_TYPES.has(field.field_type)) return <RelationFilterPill key={field.id} field={field as any} value={value} onChange={onChange} />;
        if (field.field_type === 'boolean') return <BooleanFilterPill key={field.id} field={field} value={value} onChange={onChange} />;
        if (field.field_type === 'select') return <SelectFilterPill key={field.id} field={field as any} value={value} onChange={onChange} />;
        return null;
      })}
    </ScrollView>
  );
}

// Mirrors lib/hooks/useDashboardData.ts's matchesFilterValue exactly (see
// its own header comment) -- shared so the grid/summary_tile/chart widgets
// filtering by this bar's state agree with web on what "matches" means.
export function matchesFilterValue(fieldType: string, rawValue: any, filterValue: any): boolean {
  if (filterValue === '__blank__') return rawValue === null || rawValue === undefined || rawValue === '';
  const range = fieldType === 'date' ? relativeDateFromToken(filterValue) : null;
  if (range) return matchesRelativeDate(rawValue, range);
  return String(rawValue ?? '') === String(filterValue);
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, paddingVertical: 2 },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderRadius: Radii.pill, paddingHorizontal: 14, paddingVertical: 10, maxWidth: 180,
  },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: Radii.card, borderTopRightRadius: Radii.card, paddingTop: 12, paddingBottom: Platform.OS === 'ios' ? 32 : 16 },
  sheetTitle: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: 20, paddingBottom: 8 },
  sheetRow: { paddingHorizontal: 20, paddingVertical: 14, borderTopWidth: 1 },
});
