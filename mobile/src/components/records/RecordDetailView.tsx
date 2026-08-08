import { useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Switch, Text, TextInput, View, Pressable } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import DateTimePicker from '@react-native-community/datetimepicker';

import { Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatCurrency } from '@/lib/format';
import { useSession } from '@/lib/session';
import { useRelationLabel } from '@/lib/relationLabels';
import { useRecord, useRecordFields, type RecordField, type SystemTableName } from '@/lib/records';
import { saveFieldValue } from '@/lib/recordsWrite';
import { systemTablePrimaryDisplayColumn } from '@/lib/systemTableRelations';

import { RelationPickerSheet } from './RelationPickerSheet';

const RELATION_TYPES = new Set(['entity', 'project', 'property', 'table_relation']);

function RelationFieldRow({ field, value, onSave }: { field: RecordField; value: unknown; onSave: (value: unknown) => Promise<void> }) {
  const theme = useTheme();
  const [pickerOpen, setPickerOpen] = useState(false);
  const labelQuery = useRelationLabel(field.relationTable, field.relationDisplayColumn, value);

  if (!field.relationTable || !field.relationDisplayColumn) {
    // A relation-typed field the app can't resolve a target table for --
    // shown read-only rather than silently letting an edit write an id
    // nothing can display back. Never prints the raw linked-record id.
    return (
      <View style={[styles.row, { borderColor: theme.border }]}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>{field.label}</Text>
        <Text style={[styles.value, { color: theme.text }]}>{value == null ? '-' : '(unresolved link)'}</Text>
      </View>
    );
  }

  return (
    <>
      <Pressable onPress={() => setPickerOpen(true)} style={[styles.row, { borderColor: theme.border }]}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>{field.label}</Text>
        <Text style={[styles.value, { color: theme.text }]} numberOfLines={2}>
          {/* Never falls through to the raw id -- a query that resolved but
              found nothing (target record deleted) reads as "(removed)",
              matching the "(Removed)" convention lib/hooks/useCustomTable.ts
              uses on the web app for the same case. */}
          {labelQuery.isLoading ? '…' : labelQuery.data ?? (value ? '(removed)' : '-')}
        </Text>
      </Pressable>
      <RelationPickerSheet
        visible={pickerOpen}
        table={field.relationTable}
        displayColumn={field.relationDisplayColumn}
        onClose={() => setPickerOpen(false)}
        onSelect={async (option) => {
          setPickerOpen(false);
          await onSave(option.id);
        }}
      />
    </>
  );
}

function DateFieldRow({ field, value, onSave }: { field: RecordField; value: unknown; onSave: (value: unknown) => Promise<void> }) {
  const theme = useTheme();
  const [pickerOpen, setPickerOpen] = useState(false);
  // Draft only -- committed on "Save", not on every scroll of the wheel.
  // Previously rendered the native picker directly inline in the field
  // list on tap: besides looking inconsistent (the OS widget's own font is
  // much larger than our row text), an empty field defaults the wheel to
  // today, and there was no way to back out without it looking like today
  // had been selected -- confusing, though nothing was actually saved
  // until a real onChange fired.
  const [draft, setDraft] = useState<Date>(value ? new Date(value as string) : new Date());

  const openPicker = () => {
    setDraft(value ? new Date(value as string) : new Date());
    setPickerOpen(true);
  };

  return (
    <>
      <Pressable onPress={openPicker} style={[styles.row, { borderColor: theme.border }]}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>{field.label}</Text>
        <Text style={[styles.value, { color: theme.text }]}>{value ? new Date(value as string).toLocaleDateString('en-AU') : '-'}</Text>
      </Pressable>
      <Modal visible={pickerOpen} animationType="slide" transparent onRequestClose={() => setPickerOpen(false)}>
        <View style={styles.pickerOverlay}>
          <View style={[styles.pickerSheet, { backgroundColor: theme.backgroundElement }]}>
            <Text style={[styles.pickerTitle, { color: theme.text }]}>{field.label}</Text>
            <DateTimePicker
              value={draft}
              mode="date"
              display="spinner"
              onChange={(_event, selected) => selected && setDraft(selected)}
            />
            <View style={styles.pickerButtonRow}>
              <Pressable style={styles.pickerButton} onPress={() => setPickerOpen(false)}>
                <Text style={{ color: theme.textSecondary, fontWeight: '700' }}>Cancel</Text>
              </Pressable>
              <Pressable
                style={styles.pickerButton}
                onPress={() => {
                  setPickerOpen(false);
                  onSave(draft.toISOString().slice(0, 10));
                }}
              >
                <Text style={{ color: theme.accent, fontWeight: '700' }}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

function FieldRow({
  field,
  value,
  onSave,
}: {
  field: RecordField;
  value: unknown;
  onSave: (value: unknown) => Promise<void>;
}) {
  const theme = useTheme();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value == null ? '' : String(value));
  const [saving, setSaving] = useState(false);

  const commit = async (next: unknown) => {
    setSaving(true);
    await onSave(next);
    setSaving(false);
    setEditing(false);
  };

  if (RELATION_TYPES.has(field.fieldType)) {
    return <RelationFieldRow field={field} value={value} onSave={commit} />;
  }

  if (field.fieldType === 'date') {
    return <DateFieldRow field={field} value={value} onSave={commit} />;
  }

  if (field.fieldType === 'boolean') {
    return (
      <View style={[styles.row, { borderColor: theme.border }]}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>{field.label}</Text>
        <Switch value={!!value} onValueChange={(v) => commit(v)} disabled={saving} />
      </View>
    );
  }

  if (field.fieldType === 'select' && field.selectOptions?.length) {
    return (
      <View style={[styles.row, { borderColor: theme.border, flexDirection: 'column', alignItems: 'flex-start', gap: 8 }]}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>{field.label}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {field.selectOptions.map((opt) => (
            <Pressable
              key={opt}
              onPress={() => commit(opt)}
              style={[styles.chip, { backgroundColor: value === opt ? theme.accent : theme.backgroundSelected }]}
            >
              <Text style={{ color: value === opt ? '#fff' : theme.text, fontWeight: '700', fontSize: 12 }}>{opt}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    );
  }

  if (!editing) {
    return (
      <Pressable onPress={() => setEditing(true)} style={[styles.row, { borderColor: theme.border }]}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>{field.label}</Text>
        <Text style={[styles.value, { color: theme.text }]} numberOfLines={2}>
          {value == null || value === '' ? '-' : field.fieldType === 'currency' ? formatCurrency(value) : String(value)}
        </Text>
      </Pressable>
    );
  }

  return (
    <View style={[styles.row, { borderColor: theme.border, flexDirection: 'column', alignItems: 'stretch', gap: 8 }]}>
      <Text style={[styles.label, { color: theme.textSecondary }]}>{field.label}</Text>
      <TextInput
        autoFocus
        value={draft}
        onChangeText={setDraft}
        keyboardType={field.fieldType === 'number' || field.fieldType === 'currency' ? 'decimal-pad' : 'default'}
        onSubmitEditing={() => commit(field.fieldType === 'number' || field.fieldType === 'currency' ? Number(draft) || null : draft)}
        onBlur={() => commit(field.fieldType === 'number' || field.fieldType === 'currency' ? Number(draft) || null : draft)}
        style={[styles.input, { borderColor: theme.accent, color: theme.text, backgroundColor: theme.background }]}
      />
      {saving && <ActivityIndicator size="small" />}
    </View>
  );
}

export function RecordDetailView({ tableName, recordId }: { tableName: SystemTableName; recordId: string }) {
  const theme = useTheme();
  const { profile } = useSession();
  const queryClient = useQueryClient();
  const companyId = profile?.active_company_id ?? null;

  const fieldsQuery = useRecordFields(tableName, companyId);
  const recordQuery = useRecord(tableName, companyId, recordId);
  const titleColumn = systemTablePrimaryDisplayColumn(tableName);

  if (fieldsQuery.isLoading || recordQuery.isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!recordQuery.data) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <Text style={{ color: theme.textSecondary }}>Record not found.</Text>
      </View>
    );
  }

  const record = recordQuery.data;
  const fields = (fieldsQuery.data ?? []).filter((f) => f.key !== titleColumn);

  const handleSave = async (field: RecordField, value: unknown) => {
    if (!companyId) return;
    const result = await saveFieldValue(tableName, companyId, recordId, field, value);
    if (result?.error) {
      console.error('[RecordDetailView] save failed', result.error);
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['records', tableName] });
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.background }} contentContainerStyle={{ padding: 16, gap: 10 }}>
      <Text style={[styles.title, { color: theme.text }]}>{record.title}</Text>
      <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
        {fields.map((field) => (
          <FieldRow
            key={field.key}
            field={field}
            value={record.values[field.key]}
            onSave={(value) => handleSave(field, value)}
          />
        ))}
        {fields.length === 0 && <Text style={{ color: theme.textSecondary }}>No additional fields.</Text>}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '800', marginBottom: 4 },
  card: { borderRadius: Radii.card, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    gap: 12,
  },
  label: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },
  value: { fontSize: 14, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  input: { borderWidth: 1, borderRadius: 12, padding: 10, fontSize: 14, fontWeight: '600' },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radii.pill },
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  pickerSheet: { padding: 16, paddingBottom: 32, borderTopLeftRadius: 28, borderTopRightRadius: 28, gap: 8, alignItems: 'center' },
  pickerTitle: { fontSize: 13, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.3, alignSelf: 'flex-start' },
  pickerButtonRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', paddingTop: 8 },
  pickerButton: { paddingVertical: 10, paddingHorizontal: 16 },
});
