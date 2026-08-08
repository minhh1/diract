import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useQueryClient } from '@tanstack/react-query';
import { ExternalLink } from 'lucide-react-native';

import { useTheme } from '@/hooks/use-theme';
import { openOnWeb } from '@/lib/webHandoff';
import { useRelationLabel } from '@/lib/relationLabels';
import { createCustomTableRecord, isSupportedForWrite } from '@/lib/customTableWrite';
import type { CustomTableField } from '@/lib/dashboardWidgets/customTableTypes';
import { RelationPickerSheet } from '@/components/records/RelationPickerSheet';

const RELATION_TYPES = new Set(['entity', 'project', 'property', 'table_relation']);

function isPlainTextField(field: CustomTableField): boolean {
  if (RELATION_TYPES.has(field.field_type)) return false;
  if (field.field_type === 'boolean' || field.field_type === 'date') return false;
  if (field.field_type === 'select' && field.select_options?.length) return false;
  return true;
}

// Mirrors DashboardQuickAddForm.tsx's getDefaultValues -- date fields
// default to today so same-day entries (Time Entries, etc.) don't require
// picking a date every time.
function getDefaultValues(fields: CustomTableField[]): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.field_type === 'date' && !field.formula_type) {
      defaults[field.field_key] = new Date().toISOString().slice(0, 10);
    }
  }
  return defaults;
}

function RelationInput({ field, value, onChange }: { field: CustomTableField; value: unknown; onChange: (v: unknown) => void }) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const labelQuery = useRelationLabel(field.relationSystemTable ?? null, field.relationDisplayColumn ?? null, value);

  // relationCustomTableId (a relation to another CUSTOM table) isn't
  // supported by RelationPickerSheet yet -- it only searches a literal
  // queryable table name. Shown read-only rather than letting a pick write
  // an id nothing here can resolve/display back.
  if (!field.relationSystemTable) {
    return (
      <View style={[styles.input, { borderColor: theme.border, backgroundColor: theme.background }]}>
        <Text style={{ color: theme.textSecondary, fontSize: 13 }}>{field.label} (edit on web)</Text>
      </View>
    );
  }

  return (
    <>
      <Pressable onPress={() => setOpen(true)} style={[styles.input, { borderColor: theme.border, backgroundColor: theme.background }]}>
        <Text style={{ color: value ? theme.text : theme.textSecondary, fontSize: 13 }}>
          {value ? labelQuery.data ?? '…' : `Select ${field.label}`}
        </Text>
      </Pressable>
      <RelationPickerSheet
        visible={open}
        table={field.relationSystemTable}
        displayColumn={field.relationDisplayColumn || 'name'}
        onClose={() => setOpen(false)}
        onSelect={(option) => {
          setOpen(false);
          onChange(option.id);
        }}
      />
    </>
  );
}

function FieldInput({
  field, value, onChange, inputRef, returnKeyType, onSubmitEditing,
}: {
  field: CustomTableField;
  value: unknown;
  onChange: (v: unknown) => void;
  inputRef?: (el: TextInput | null) => void;
  returnKeyType?: 'next' | 'done';
  onSubmitEditing?: () => void;
}) {
  const theme = useTheme();
  const [pickerOpen, setPickerOpen] = useState(false);

  if (RELATION_TYPES.has(field.field_type)) {
    return <RelationInput field={field} value={value} onChange={onChange} />;
  }

  if (field.field_type === 'boolean') {
    return (
      <View style={[styles.switchRow, { borderColor: theme.border, backgroundColor: theme.background }]}>
        <Text style={{ color: theme.text, fontSize: 13 }}>{field.label}</Text>
        <Switch value={!!value} onValueChange={onChange} />
      </View>
    );
  }

  if (field.field_type === 'date') {
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

  if (field.field_type === 'select' && field.select_options?.length) {
    return (
      <View style={{ gap: 6 }}>
        <Text style={{ color: theme.textSecondary, fontSize: 11, fontWeight: '700' }}>{field.label}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {field.select_options.map((opt) => (
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
      ref={inputRef}
      value={value == null ? '' : String(value)}
      onChangeText={(text) => onChange(field.field_type === 'number' || field.field_type === 'currency' ? (text === '' ? null : Number(text) || 0) : text)}
      placeholder={field.label}
      placeholderTextColor={theme.textSecondary}
      keyboardType={field.field_type === 'number' || field.field_type === 'currency' ? 'decimal-pad' : 'default'}
      returnKeyType={returnKeyType}
      onSubmitEditing={onSubmitEditing}
      blurOnSubmit={returnKeyType === 'done'}
      style={[styles.input, { borderColor: theme.border, backgroundColor: theme.background, color: theme.text }]}
    />
  );
}

// Custom-table counterpart to QuickAddFormWidget.tsx (which only writes to
// the 3 system tables via lib/recordsWrite.ts) -- writes through
// customTableWrite.ts's createCustomTableRecord instead, including formula
// computation. A formula-typed field (e.g. Amount = Rate x Duration) is
// excluded from the form entirely rather than shown as an editable input --
// it's always recomputed on save regardless of what's typed in, so letting
// someone type a value into it would just be silently overwritten, same
// reasoning as the DB-level ignore.
export function CustomTableQuickAddForm({
  tableId,
  companyId,
  userId,
  allFields,
  fieldIds,
  dashboardSlug,
  onAdded,
  prefill,
  onPrefillApplied,
}: {
  tableId: string;
  companyId: string;
  userId: string;
  allFields: CustomTableField[];
  fieldIds: string[];
  dashboardSlug: string;
  onAdded: () => void;
  // Set by MyTasksButtonWidget's "Convert" (via [slug].tsx's
  // quickAddPrefill state) -- merged into this form's own values once,
  // then the caller clears it back to null via onPrefillApplied so a
  // second Convert (even with identical values) still re-applies.
  prefill?: Record<string, unknown> | null;
  onPrefillApplied?: () => void;
}) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const fieldById = new Map(allFields.map((f) => [f.id, f]));
  const fields = fieldIds.map((id) => fieldById.get(id)).filter((f): f is CustomTableField => !!f);
  const inputFields = fields.filter((f) => !f.formula_type);
  const [values, setValues] = useState<Record<string, unknown>>(() => getDefaultValues(inputFields));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState<boolean | null>(null);
  const textInputRefs = useRef<Record<string, TextInput | null>>({});

  useEffect(() => {
    let cancelled = false;
    isSupportedForWrite(tableId, allFields).then((ok) => { if (!cancelled) setSupported(ok); });
    return () => { cancelled = true; };
  }, [tableId, allFields]);

  useEffect(() => {
    if (!prefill) return;
    setValues((prev) => ({ ...prev, ...prefill }));
    onPrefillApplied?.();
    // onPrefillApplied is a fresh closure every render (owned by [slug].tsx's
    // state setter) -- including it would re-fire this effect on every
    // unrelated re-render, not just when `prefill` itself actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill]);

  const submit = async () => {
    setSaving(true);
    setError(null);
    const result = await createCustomTableRecord(tableId, companyId, userId, values, allFields);
    setSaving(false);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    setValues(getDefaultValues(inputFields));
    queryClient.invalidateQueries({ queryKey: ['custom-table-records', tableId] });
    onAdded();
  };

  if (supported === null) return <ActivityIndicator />;
  // Ledger tables and rollup (sum_related/max_related) fields aren't
  // handled by this write path yet -- see customTableWrite.ts's header
  // comment. Same "open on web" fallback DashboardWidgetRenderer.tsx uses
  // for a genuinely unsupported widget type, just decided here since it
  // needs the async is_ledger check this component already makes.
  if (!supported) {
    return (
      <Pressable
        onPress={() => openOnWeb(`/dashboard/boards/${dashboardSlug}`)}
        style={[styles.fallback, { borderColor: theme.border, backgroundColor: theme.backgroundSelected }]}
      >
        <Text style={{ color: theme.textSecondary, fontSize: 12, fontWeight: '600', flex: 1 }}>This widget only renders on the web dashboard</Text>
        <ExternalLink size={14} color={theme.textSecondary} />
      </Pressable>
    );
  }
  if (inputFields.length === 0) return <Text style={{ color: theme.textSecondary, fontSize: 12 }}>This form has no fields configured.</Text>;

  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      {inputFields.map((field, i) => {
        if (!isPlainTextField(field)) {
          return <FieldInput key={field.id} field={field} value={values[field.field_key]} onChange={(v) => setValues((prev) => ({ ...prev, [field.field_key]: v }))} />;
        }
        const nextField = inputFields.slice(i + 1).find(isPlainTextField);
        return (
          <FieldInput
            key={field.id}
            field={field}
            value={values[field.field_key]}
            onChange={(v) => setValues((prev) => ({ ...prev, [field.field_key]: v }))}
            inputRef={(el) => {
              textInputRefs.current[field.field_key] = el;
            }}
            returnKeyType={nextField ? 'next' : 'done'}
            onSubmitEditing={() => (nextField ? textInputRefs.current[nextField.field_key]?.focus() : Keyboard.dismiss())}
          />
        );
      })}
      {error && <Text style={{ color: theme.danger, fontSize: 12, fontWeight: '600' }}>{error}</Text>}
      <Pressable onPress={submit} disabled={saving} style={[styles.submitButton, { backgroundColor: theme.accent, opacity: saving ? 0.6 : 1 }]}>
        {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.submitButtonText}>Add</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 12, borderWidth: 1 },
  card: { padding: 14, borderRadius: 16, borderWidth: 1, gap: 10 },
  input: { borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 13 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderRadius: 12, padding: 12 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14 },
  submitButton: { borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
  submitButtonText: { color: '#fff', fontWeight: '800', fontSize: 13 },
});
