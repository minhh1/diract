import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { Check, CheckCircle2, FileUp, Settings2, Trash2, Upload, X } from 'lucide-react-native';

import { Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';
import { APP_URL } from '@/lib/config';
import { callApi } from '@/lib/api';
import type { InvoiceImportWidget as InvoiceImportWidgetConfig } from '@/lib/dashboardWidgets/types';

interface ParsedLineItem { description: string; amount: number; }
interface ParsedInvoice {
  supplierName: string; invoiceNumber: string; invoiceDate: string;
  lineItems: ParsedLineItem[];
}
interface ReviewLineItem extends ParsedLineItem { included: boolean; }

// Uploads via a raw fetch (not lib/api.ts's callApi, which hardcodes
// application/json) -- RN's fetch sets the multipart boundary itself off
// the FormData body, same as the web app's plain <input type="file"> ->
// FormData upload to this exact route (app/api/generic-invoice-import/parse).
async function uploadPdf(uri: string, name: string): Promise<Response> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Not signed in.');
  const formData = new FormData();
  formData.append('file', { uri, name, type: 'application/pdf' } as unknown as Blob);
  return fetch(`${APP_URL}/api/generic-invoice-import/parse`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
}

function ImportModal({ dashboardId, widgetId, onClose, onImported }: { dashboardId: string; widgetId: string; onClose: () => void; onImported: () => void }) {
  const theme = useTheme();
  const [parsing, setParsing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invoice, setInvoice] = useState<ParsedInvoice | null>(null);
  const [items, setItems] = useState<ReviewLineItem[]>([]);
  const [supplierName, setSupplierName] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [result, setResult] = useState<number | null>(null);

  const pickFile = async () => {
    const picked = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
    if (picked.canceled || !picked.assets?.[0]) return;
    const file = picked.assets[0];
    setError(null);
    setParsing(true);
    try {
      const res = await uploadPdf(file.uri, file.name || 'invoice.pdf');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Couldn't read this invoice");
      const parsed = json as ParsedInvoice;
      setInvoice(parsed);
      setSupplierName(parsed.supplierName || '');
      setInvoiceNumber(parsed.invoiceNumber || '');
      setInvoiceDate(parsed.invoiceDate || '');
      setItems((parsed.lineItems || []).map((li) => ({ ...li, included: true })));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't read this invoice");
    } finally {
      setParsing(false);
    }
  };

  const toggleItem = (i: number) => setItems((prev) => prev.map((li, idx) => (idx === i ? { ...li, included: !li.included } : li)));
  const updateItem = (i: number, patch: Partial<ReviewLineItem>) => setItems((prev) => prev.map((li, idx) => (idx === i ? { ...li, ...patch } : li)));

  const includedCount = items.filter((li) => li.included).length;

  const commit = async () => {
    const lineItems = items.filter((li) => li.included).map((li) => ({
      description: li.description, amount: li.amount,
      supplierName: supplierName || null, invoiceNumber: invoiceNumber || null, invoiceDate: invoiceDate || null,
    }));
    if (!lineItems.length) { setError('Nothing selected to add'); return; }
    setCommitting(true);
    setError(null);
    try {
      const res = await callApi('/api/generic-invoice-import/commit', {
        method: 'POST',
        body: JSON.stringify({ dashboardId, widgetId, lineItems }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Couldn't add these line items");
      setResult(json.created);
      onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add these line items");
    } finally {
      setCommitting(false);
    }
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={[styles.sheet, { backgroundColor: theme.background }]}>
        <View style={[styles.sheetHeader, { borderColor: theme.border }]}>
          <Text style={[styles.sheetTitle, { color: theme.text }]}>Import invoice from PDF</Text>
          <Pressable onPress={onClose} hitSlop={8}><X size={20} color={theme.textSecondary} /></Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {result !== null ? (
            <View style={styles.resultBox}>
              <CheckCircle2 size={32} color={theme.success} />
              <Text style={{ color: theme.text, fontSize: 14, fontWeight: '800' }}>Added {result} line item{result === 1 ? '' : 's'}</Text>
              <Pressable onPress={onClose} style={[styles.doneButton, { backgroundColor: theme.text }]}>
                <Text style={{ color: theme.background, fontSize: 12, fontWeight: '800' }}>Done</Text>
              </Pressable>
            </View>
          ) : !invoice ? (
            <Pressable onPress={pickFile} disabled={parsing} style={[styles.dropZone, { borderColor: theme.border }]}>
              {parsing ? (
                <>
                  <ActivityIndicator />
                  <Text style={{ color: theme.textSecondary, fontSize: 12 }}>Reading the invoice...</Text>
                </>
              ) : (
                <>
                  <Upload size={24} color={theme.textSecondary} />
                  <Text style={{ color: theme.text, fontSize: 13, fontWeight: '700' }}>Tap to choose a PDF invoice</Text>
                  <Text style={{ color: theme.textSecondary, fontSize: 11, textAlign: 'center' }}>Line items will be extracted for review before anything is added.</Text>
                </>
              )}
            </Pressable>
          ) : (
            <View style={{ gap: 16 }}>
              <View style={{ gap: 10 }}>
                <View>
                  <Text style={styles.fieldLabel}>Supplier</Text>
                  <TextInput value={supplierName} onChangeText={setSupplierName} style={[styles.input, { borderColor: theme.border, backgroundColor: theme.backgroundElement, color: theme.text }]} />
                </View>
                <View>
                  <Text style={styles.fieldLabel}>Invoice number</Text>
                  <TextInput value={invoiceNumber} onChangeText={setInvoiceNumber} style={[styles.input, { borderColor: theme.border, backgroundColor: theme.backgroundElement, color: theme.text }]} />
                </View>
                <View>
                  <Text style={styles.fieldLabel}>Date</Text>
                  <TextInput value={invoiceDate} onChangeText={setInvoiceDate} placeholder="YYYY-MM-DD" placeholderTextColor={theme.textSecondary} style={[styles.input, { borderColor: theme.border, backgroundColor: theme.backgroundElement, color: theme.text }]} />
                </View>
              </View>

              <View style={[styles.itemsCard, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
                <Text style={styles.fieldLabel}>Line items</Text>
                {items.map((li, i) => (
                  <View key={i} style={[styles.itemRow, { borderColor: theme.border }]}>
                    <Pressable onPress={() => toggleItem(i)} style={[styles.checkbox, { borderColor: theme.border, backgroundColor: li.included ? theme.accent : 'transparent' }]}>
                      {li.included && <Check size={12} color="#fff" />}
                    </Pressable>
                    <TextInput
                      value={li.description}
                      onChangeText={(text) => updateItem(i, { description: text })}
                      style={[styles.itemDescInput, { color: theme.text }]}
                    />
                    <TextInput
                      value={String(li.amount)}
                      onChangeText={(text) => updateItem(i, { amount: Number(text) || 0 })}
                      keyboardType="decimal-pad"
                      style={[styles.itemAmountInput, { borderColor: theme.border, color: theme.text }]}
                    />
                  </View>
                ))}
                {items.length === 0 && <Text style={styles.emptyText}>No line items found</Text>}
              </View>
            </View>
          )}

          {error && <Text style={{ color: theme.danger, fontSize: 12, fontWeight: '600', marginTop: 12 }}>{error}</Text>}
        </ScrollView>

        {invoice && result === null && (
          <View style={[styles.footer, { borderColor: theme.border }]}>
            <Pressable onPress={() => { setInvoice(null); setItems([]); }} disabled={committing} style={styles.startOverButton}>
              <Trash2 size={13} color={theme.textSecondary} />
              <Text style={{ color: theme.textSecondary, fontSize: 12, fontWeight: '700' }}>Start over</Text>
            </Pressable>
            <Pressable onPress={commit} disabled={committing || !includedCount} style={[styles.commitButton, { backgroundColor: theme.accent, opacity: committing || !includedCount ? 0.5 : 1 }]}>
              {committing ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>Add {includedCount || ''} item{includedCount === 1 ? '' : 's'}</Text>}
            </Pressable>
          </View>
        )}
      </View>
    </Modal>
  );
}

// Native port of components/dashboard/InvoiceImportWidget.tsx +
// InvoiceImportModal.tsx -- no parsing/commit logic duplicated at all, both
// go through the exact same server routes the web app uses
// (app/api/generic-invoice-import/parse + .../commit), just reached via
// expo-document-picker + a raw multipart upload instead of a browser
// <input type="file">.
export function InvoiceImportWidget({
  config, dashboardId, widgetId, onImported,
}: {
  config: InvoiceImportWidgetConfig['config'];
  dashboardId: string | null;
  widgetId: string;
  onImported?: () => void;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const configured = !!(config.descriptionFieldId && config.amountFieldId);

  if (!dashboardId) return <Text style={styles.emptyText}>Save this dashboard on web to enable imports</Text>;
  if (!configured) {
    return (
      <View style={[styles.warningBanner, { backgroundColor: theme.dangerBackground }]}>
        <Settings2 size={13} color={theme.danger} />
        <Text style={{ color: theme.textSecondary, fontSize: 11, flex: 1 }}>Needs its description/amount fields mapped on web first.</Text>
      </View>
    );
  }

  return (
    <>
      <Pressable onPress={() => setOpen(true)} style={[styles.launcherButton, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
        <FileUp size={16} color={theme.text} />
        <Text style={{ color: theme.text, fontWeight: '800', fontSize: 12 }}>Import invoice (PDF)</Text>
      </Pressable>
      {open && (
        <ImportModal
          dashboardId={dashboardId}
          widgetId={widgetId}
          onClose={() => setOpen(false)}
          onImported={() => onImported?.()}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  launcherButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderRadius: Radii.card, paddingVertical: 16 },
  warningBanner: { flexDirection: 'row', gap: 8, padding: 12, borderRadius: 14, alignItems: 'flex-start' },
  emptyText: { textAlign: 'center', paddingVertical: 20, fontSize: 11, fontStyle: 'italic', color: '#94a3b8' },
  sheet: { flex: 1, paddingTop: 60 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1 },
  sheetTitle: { fontSize: 15, fontWeight: '800' },
  body: { padding: 20 },
  dropZone: { borderWidth: 2, borderStyle: 'dashed', borderRadius: Radii.card, paddingVertical: 48, alignItems: 'center', gap: 10, paddingHorizontal: 24 },
  resultBox: { alignItems: 'center', gap: 10, paddingVertical: 48 },
  doneButton: { marginTop: 8, paddingHorizontal: 20, paddingVertical: 10, borderRadius: Radii.pill },
  fieldLabel: { fontSize: 9, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4, color: '#94a3b8', marginBottom: 4 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13 },
  itemsCard: { borderWidth: 1, borderRadius: Radii.card, padding: 12, gap: 8 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1, paddingTop: 8 },
  checkbox: { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  itemDescInput: { flex: 1, fontSize: 12 },
  itemAmountInput: { width: 70, borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, fontSize: 12, textAlign: 'right' },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderTopWidth: 1 },
  startOverButton: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  commitButton: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: Radii.pill },
});
