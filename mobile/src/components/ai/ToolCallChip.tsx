import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Check, LayoutDashboard, ListChecks, PlusSquare, Search, Sparkles, Table2, Trash2, X, type LucideIcon } from 'lucide-react-native';

import { useTheme } from '@/hooks/use-theme';
import type { ToolCallEvent } from '@/lib/aiChat';

// Mirrors components/ai/AiChatThread.tsx's TOOL_ICONS/toolLabel on the web
// app exactly, so a build looks identical whichever platform it's watched
// from.
const TOOL_ICONS: Record<string, LucideIcon> = {
  list_existing_tables: ListChecks,
  list_existing_dashboards: ListChecks,
  research: Search,
  create_table: Table2,
  create_field: PlusSquare,
  create_dashboard: LayoutDashboard,
  add_widget: LayoutDashboard,
  delete_table: Trash2,
  delete_field: Trash2,
  remove_widget: Trash2,
  delete_dashboard: Trash2,
};

function toolLabel(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case 'list_existing_tables':
      return 'Checking existing tables';
    case 'list_existing_dashboards':
      return 'Checking existing dashboards';
    case 'research':
      return `Researching: ${input.question ?? ''}`;
    case 'create_table':
      return `Creating table "${input.name ?? ''}"`;
    case 'create_field': {
      const type = typeof input.field_type === 'string' ? ` (${input.field_type})` : '';
      return `Adding field "${input.label ?? ''}"${type}`;
    }
    case 'create_dashboard':
      return `Creating dashboard "${input.name ?? ''}"`;
    case 'add_widget': {
      const labels = Array.isArray(input.field_labels) && input.field_labels.length ? `: ${input.field_labels.join(', ')}` : '';
      return `Adding a ${input.widget_type ?? 'widget'} widget${labels}`;
    }
    case 'delete_table':
      return 'Deleting table';
    case 'delete_field':
      return 'Removing field';
    case 'remove_widget':
      return 'Removing widget';
    case 'delete_dashboard':
      return 'Deleting dashboard';
    default:
      return name;
  }
}

export function ToolCallChip({ call }: { call: ToolCallEvent }) {
  const theme = useTheme();
  const Icon = TOOL_ICONS[call.name] || Sparkles;
  const inFlight = call.phase === 'start';
  return (
    <View style={[styles.chip, { backgroundColor: theme.backgroundSelected, borderColor: theme.border }]}>
      {inFlight ? (
        <ActivityIndicator size="small" color={theme.textSecondary} />
      ) : call.isError ? (
        <X size={13} color={theme.danger} />
      ) : (
        <Check size={13} color={theme.success} />
      )}
      <Icon size={13} color={theme.textSecondary} />
      <Text numberOfLines={1} style={[styles.label, { color: theme.textSecondary }]}>
        {toolLabel(call.name, call.input)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1, alignSelf: 'flex-start', maxWidth: '100%' },
  label: { fontSize: 13, fontWeight: '600', flexShrink: 1 },
});
