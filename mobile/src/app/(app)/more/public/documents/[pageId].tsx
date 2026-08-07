import { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View, Pressable } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import { CheckCircle2, Download, Lock } from 'lucide-react-native';

import { Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { GradientButton } from '@/components/ui/GradientButton';
import {
  fetchDocumentFillPage,
  saveDocumentFillDraft,
  useSubmitDocumentFill,
  type DocumentFillField,
  type GeneratedFile,
} from '@/lib/documentFillPages';

// Native port of components/public/PublicDocumentsContent.tsx -- see that
// lib file's header comment: even a signed-in company member hits the same
// access-code gate as an anonymous client, since this page has no separate
// "staff" API. Trims the web version's live-preview/autosave-on-every-
// keystroke to a plain form + generate flow; still autosaves the draft
// (debounced) so a staff member picking this back up doesn't lose typed
// answers.
function isFieldVisible(field: DocumentFillField, values: Record<string, string>, byTagKey: Map<string, DocumentFillField>): boolean {
  if (!field.triggerTagKey) return true;
  const triggerField = byTagKey.get(field.triggerTagKey);
  if (triggerField && !isFieldVisible(triggerField, values, byTagKey)) return false;
  const current = values[field.triggerTagKey] ?? '';
  const allowed = (field.triggerValue ?? '').split('||').map((v) => v.trim());
  return allowed.includes(current);
}

export default function DocumentFillPageScreen() {
  const theme = useTheme();
  const { pageId } = useLocalSearchParams<{ pageId: string }>();
  const [code, setCode] = useState('');
  const [codeAttempt, setCodeAttempt] = useState<string | undefined>(undefined);
  const [values, setValues] = useState<Record<string, string>>({});
  const [naFields, setNaFields] = useState<Set<string>>(new Set());
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [results, setResults] = useState<{ files: GeneratedFile[]; zipUrl: string | null }[]>([]);
  const [error, setError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['document-fill-page', pageId, codeAttempt],
    queryFn: async () => {
      const data = await fetchDocumentFillPage(pageId, codeAttempt);
      if (!data.requiresCode) {
        setValues(Object.fromEntries(data.fields.map((f) => [f.tagKey, f.value])));
        setNaFields(new Set(data.naFields ?? []));
        setActiveDocId(data.documents[0]?.id ?? null);
      }
      return data;
    },
  });
  const submit = useSubmitDocumentFill(pageId);

  const byTagKey = useMemo(() => new Map((query.data?.fields ?? []).map((f) => [f.tagKey, f])), [query.data]);
  const activeDoc = query.data?.documents.find((d) => d.id === activeDocId) ?? query.data?.documents[0];
  const visibleFields = (query.data?.fields ?? []).filter(
    (f) => (!activeDoc || query.data!.documents.length === 1 || activeDoc.fieldTagKeys.includes(f.tagKey)) && isFieldVisible(f, values, byTagKey),
  );

  const setValue = (tagKey: string, v: string) => {
    setValues((prev) => {
      const next = { ...prev, [tagKey]: v };
      saveDocumentFillDraft(pageId, next, Array.from(naFields), codeAttempt).catch(() => {});
      return next;
    });
  };

  const toggleNa = (tagKey: string) => {
    setNaFields((prev) => {
      const next = new Set(prev);
      if (next.has(tagKey)) next.delete(tagKey);
      else next.add(tagKey);
      saveDocumentFillDraft(pageId, values, Array.from(next), codeAttempt).catch(() => {});
      return next;
    });
  };

  const generate = async () => {
    setError(null);
    const missing = visibleFields.filter((f) => f.isRequired && !naFields.has(f.tagKey) && !values[f.tagKey]?.trim());
    if (missing.length > 0) {
      setError(`Please fill in: ${missing.map((f) => f.label).join(', ')}`);
      return;
    }
    try {
      const result = await submit.mutateAsync({
        values,
        naFields: Array.from(naFields),
        code: codeAttempt,
        templateIds: query.data && query.data.documents.length > 1 && activeDoc ? [activeDoc.id] : undefined,
      });
      setResults((prev) => [result, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate the document.');
    }
  };

  if (query.isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator />
      </View>
    );
  }

  if (query.data?.requiresCode) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background, paddingHorizontal: 32, gap: 16 }]}>
        <Lock size={28} color={theme.textSecondary} />
        <Text style={{ color: theme.text, fontSize: 16, fontWeight: '800', textAlign: 'center' }}>{query.data.title}</Text>
        <Text style={{ color: theme.textSecondary, textAlign: 'center' }}>Enter the access code to continue.</Text>
        <TextInput
          value={code}
          onChangeText={setCode}
          autoCapitalize="characters"
          placeholder="Access code"
          placeholderTextColor={theme.textSecondary}
          returnKeyType="done"
          onSubmitEditing={() => setCodeAttempt(code.trim())}
          style={[styles.codeInput, { backgroundColor: theme.backgroundElement, color: theme.text }]}
        />
        <GradientButton onPress={() => setCodeAttempt(code.trim())} style={{ alignSelf: 'stretch' }}>
          Continue
        </GradientButton>
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.background }} contentContainerStyle={styles.content}>
      <Text style={[styles.heading, { color: theme.text }]}>{query.data?.heading}</Text>

      {(query.data?.documents.length ?? 0) > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
          {query.data!.documents.map((doc) => (
            <Pressable
              key={doc.id}
              onPress={() => setActiveDocId(doc.id)}
              style={[styles.docTab, { backgroundColor: doc.id === activeDocId ? theme.accent : theme.backgroundSelected }]}
            >
              <Text style={{ color: doc.id === activeDocId ? '#fff' : theme.textSecondary, fontWeight: '700', fontSize: 12 }}>{doc.name}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {visibleFields.map((field) => {
        const isNa = naFields.has(field.tagKey);
        return (
          <View key={field.tagKey} style={styles.fieldBlock}>
            <View style={styles.fieldLabelRow}>
              <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>
                {field.label}
                {field.isRequired ? ' *' : ''}
              </Text>
              <Pressable onPress={() => toggleNa(field.tagKey)}>
                <Text style={{ color: isNa ? theme.accent : theme.textSecondary, fontSize: 11, fontWeight: '700' }}>N/A</Text>
              </Pressable>
            </View>
            {field.fieldType === 'select' || field.fieldType === 'multiselect' ? (
              <View style={styles.chipRow}>
                {(field.selectOptions ?? []).map((opt) => {
                  const selected = field.fieldType === 'multiselect' ? (values[field.tagKey] ?? '').split(', ').includes(opt) : values[field.tagKey] === opt;
                  return (
                    <Pressable
                      key={opt}
                      disabled={isNa}
                      onPress={() => {
                        if (field.fieldType === 'multiselect') {
                          const current = (values[field.tagKey] ?? '').split(', ').filter(Boolean);
                          const next = current.includes(opt) ? current.filter((v) => v !== opt) : [...current, opt];
                          setValue(field.tagKey, next.join(', '));
                        } else {
                          setValue(field.tagKey, opt);
                        }
                      }}
                      style={[styles.chip, { backgroundColor: selected ? theme.accent : theme.backgroundSelected, opacity: isNa ? 0.4 : 1 }]}
                    >
                      <Text style={{ color: selected ? '#fff' : theme.text, fontWeight: '700', fontSize: 12 }}>{opt}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <TextInput
                value={isNa ? '' : values[field.tagKey] ?? ''}
                onChangeText={(v) => setValue(field.tagKey, v)}
                editable={!isNa}
                keyboardType={field.fieldType === 'number' || field.fieldType === 'currency' ? 'decimal-pad' : 'default'}
                style={[styles.input, { backgroundColor: theme.backgroundElement, color: theme.text, opacity: isNa ? 0.4 : 1 }]}
              />
            )}
          </View>
        );
      })}

      {error && <Text style={{ color: theme.danger, fontSize: 12, fontWeight: '600' }}>{error}</Text>}

      <GradientButton onPress={generate} loading={submit.isPending} style={{ marginTop: 8 }}>
        {(query.data?.documents.length ?? 0) > 1 ? `Generate ${activeDoc?.name ?? 'document'}` : 'Generate document'}
      </GradientButton>

      {results.map((result, i) => (
        <View key={i} style={[styles.resultCard, { backgroundColor: theme.successBackground }]}>
          <CheckCircle2 size={16} color={theme.success} />
          <View style={{ flex: 1, gap: 6 }}>
            {result.files.map((file) => (
              <Pressable key={file.url} onPress={() => WebBrowser.openBrowserAsync(file.url)} style={styles.fileLink}>
                <Download size={14} color={theme.accent} />
                <Text style={{ color: theme.accent, fontWeight: '700', fontSize: 13 }} numberOfLines={1}>
                  {file.name}
                </Text>
              </Pressable>
            ))}
            {result.zipUrl && (
              <Pressable onPress={() => WebBrowser.openBrowserAsync(result.zipUrl!)} style={styles.fileLink}>
                <Download size={14} color={theme.accent} />
                <Text style={{ color: theme.accent, fontWeight: '700', fontSize: 13 }}>Download all (.zip)</Text>
              </Pressable>
            )}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, gap: 14, paddingBottom: 48 },
  heading: { fontSize: 20, fontWeight: '800' },
  codeInput: { width: '100%', padding: 14, borderRadius: Radii.pill, fontSize: 16, fontWeight: '700', textAlign: 'center', letterSpacing: 2 },
  docTab: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radii.pill },
  fieldBlock: { gap: 6 },
  fieldLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  fieldLabel: { fontSize: 12, fontWeight: '700' },
  input: { padding: 12, borderRadius: Radii.input, fontSize: 14, fontWeight: '600' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radii.pill },
  resultCard: { flexDirection: 'row', gap: 10, padding: 14, borderRadius: Radii.badge, alignItems: 'flex-start' },
  fileLink: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
