import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useQueryClient } from '@tanstack/react-query';

import { useTheme } from '@/hooks/use-theme';
import { useRelationLabel } from '@/lib/relationLabels';
import { createRecord } from '@/lib/recordsWrite';
import type { RecordField, SystemTableName } from '@/lib/records';
import { RelationPickerSheet } from '@/components/records/RelationPickerSheet';

const RELATION_TYPES = new Set(['entity', 'project', 'property', 'table_relation']);

function RelationInput({ field, value, onChange }: { field: RecordField; value: unknown; onChange: (v: unknown) => void }) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const labelQuery = useRelationLabel(field.relationTable, field.relationDisplayColumn, value);

  if (!field.relationTable || !field.relationDisplayColumn) return null;

  return (
    <>
      <Pressable onPress={() => setOpen(true)} style={[styles.input, { borderColor: theme.border, backgroundColor: theme.background }]}>
        <Text style={{ color: value ? theme.text : theme.textSecondary, fontSize: 13 }}>
          {value ? labelQuery.data ?? '…' : `Select ${field.label}`}
        </Text>
      </Pressable>
      <RelationPickerSheet
        visible={open}
        table={field.relationTable}
        displayColumn={field.relationDisplayColumn}
        onClose={() => setOpen(false)}
        onSelect={(option) => {
          setOpen(false);
          onChange(option.id);
        }}
      />
    </>
  );
}

function FieldInput({ field, value, onChange }: { field: RecordField; value: unknown; onChange: (v: unknown) => void }) {
  const theme = useTheme();
  const [pickerOpen, setPickerOpen] = useState(false);

  if (RELATION_TYPES.has(field.fieldType)) {
    return <RelationInput field={field} value={value} onChange={onChange} />;
  }

  if (field.fieldType === 'boolean') {
    return (
      <View style={[styles.switchRow, { borderColor: theme.border, backgroundColor: theme.background }]}>
        <Text style={{ color: theme.text, fontSize: 13 }}>{field.label}</Text>
        <Switch value={!!value} onValueChange={onChange} />
      </View>
    );
  }

  if (field.fieldType === 'date') {
    return (
      <>
        <Pressable onPress={() => setPickerOpen(true)} style={[styles.input, { borderColor: theme.border, backgroundColor: theme.background }]}>
          <Text style={{ color: value ? theme.text : theme.textSecondary, fontSize: 13 }}>
            {value ? new Date(String(value)).toLocaleDateString('en-AU') : field.label}
          </Text>
        </Pressable>
        {pickerOpen && (
          <DateTimePicker
            value={value ? new Date(String(value)) : new Date()}
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

  if (field.fieldType === 'select' && field.selectOptions?.length) {
    return (
      <View style={{ gap: 6 }}>
        <Text style={{ color: theme.textSecondary, fontSize: 11, fontWeight: '700' }}>{field.label}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {field.selectOptions.map((opt) => (
            <Pressable
              key={opt}
              onPress={() => onChange(value === opt ? null : opt)}
              style={[styles.chip, { backgroundColor: value === opt ? theme.accent : theme.backgroundSelected }]}
            >
              <Text style={{ color: value === opt ? '#fff' : theme.text, fontWeight: '700', fontSize: 12 }}>{opt}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    );
  }

  return (
    <TextInput
      value={value == null ? '' : String(value)}
      onChangeText={(text) => onChange(field.fieldType === 'number' || field.fieldType === 'currency' ? (text === '' ? null : Number(text) || 0) : text)}
      placeholder={field.label}
      placeholderTextColor={theme.textSecondary}
      keyboardType={field.fieldType === 'number' || field.fieldType === 'currency' ? 'decimal-pad' : 'default'}
      style={[styles.input, { borderColor: theme.border, backgroundColor: theme.background, color: theme.text }]}
    />
  );
}

// Native port of components/dashboard/DashboardQuickAddForm.tsx -- creates a
// record via src/lib/recordsWrite.ts's createRecord (mirrors
// lib/services/systemTableRecordService.ts's own native/custom split)
// instead of the web version's generic customTableService path, since this
// only ever targets one of the 3 system tables companyDashboards.ts
// supports. Drops formula-field live preview, drag-to-reorder, optimistic
// add, and fixedValues/prefill (all either builder-only or meant for a
// record-scoped sub-dashboard mobile doesn't have yet) -- just the fields,
// values, and an Add button.
export function QuickAddFormWidget({
  tableName,
  companyId,
  allFields,
  fieldIds,
  onAdded,
}: {
  tableName: SystemTableName;
  companyId: string;
  allFields: RecordField[];
  fieldIds: string[];
  onAdded: () => void;
}) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fieldById = new Map(allFields.map((f) => [f.key, f]));
  const fields = fieldIds.map((id) => fieldById.get(id)).filter((f): f is RecordField => !!f);

  const submit = async () => {
    setSaving(true);
    setError(null);
    const result = await createRecord(tableName, companyId, fields, values);
    setSaving(false);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    setValues({});
    queryClient.invalidateQueries({ queryKey: ['records', tableName] });
    onAdded();
  };

  if (fields.length === 0) return <Text style={{ color: theme.textSecondary, fontSize: 12 }}>This form has no fields configured.</Text>;

  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      {fields.map((field) => (
        <FieldInput key={field.key} field={field} value={values[field.key]} onChange={(v) => setValues((prev) => ({ ...prev, [field.key]: v }))} />
      ))}
      {error && <Text style={{ color: theme.danger, fontSize: 12, fontWeight: '600' }}>{error}</Text>}
      <Pressable onPress={submit} disabled={saving} style={[styles.submitButton, { backgroundColor: theme.accent, opacity: saving ? 0.6 : 1 }]}>
        {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.submitButtonText}>Add</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 14, borderRadius: 16, borderWidth: 1, gap: 10 },
  input: { borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 13 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderRadius: 12, padding: 12 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14 },
  submitButton: { borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
  submitButtonText: { color: '#fff', fontWeight: '800', fontSize: 13 },
});
