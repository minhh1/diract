import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { safeHref } from '@/lib/pages/safeHref';
import type { PageBlock } from '@/lib/pages/blockTypes';

const SPACER_HEIGHT: Record<'sm' | 'md' | 'lg', number> = { sm: 16, md: 32, lg: 64 };

// Native port of components/pages/PageBlockRenderer.tsx -- the single
// trusted rendering path for company_pages.blocks. Every text field
// renders via a plain <Text> child, same "no markup parser in the render
// path" property the web version leans on (see its own header comment);
// a button/image URL is re-validated through safeHref (a verbatim port of
// lib/safeHref.ts) even though the server already validates on write, same
// defense-in-depth the web renderer applies.
function BlockView({ block }: { block: PageBlock }) {
  const theme = useTheme();

  switch (block.type) {
    case 'heading': {
      const size = block.level === 1 ? 26 : block.level === 2 ? 21 : 17;
      return <Text style={{ color: theme.text, fontWeight: '800', fontSize: size }}>{block.text}</Text>;
    }
    case 'paragraph':
      return <Text style={{ color: theme.textSecondary, fontSize: 14, lineHeight: 21 }}>{block.text}</Text>;
    case 'image': {
      const uri = safeHref(block.url);
      return uri ? <Image source={{ uri }} accessibilityLabel={block.alt} style={styles.image} resizeMode="cover" /> : null;
    }
    case 'button': {
      const uri = safeHref(block.url);
      if (!uri) return <View style={[styles.buttonDisabled, { backgroundColor: theme.backgroundSelected }]}><Text style={{ color: theme.textSecondary, fontSize: 13, fontWeight: '700' }}>{block.label}</Text></View>;
      return (
        <Pressable onPress={() => Linking.openURL(uri)} style={[styles.button, { backgroundColor: theme.accent }]}>
          <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>{block.label}</Text>
        </Pressable>
      );
    }
    case 'divider':
      return <View style={[styles.divider, { backgroundColor: theme.border }]} />;
    case 'list':
      return (
        <View style={{ gap: 4 }}>
          {block.items.map((item, i) => (
            <View key={i} style={styles.listRow}>
              <Text style={{ color: theme.textSecondary, fontSize: 14 }}>{block.style === 'number' ? `${i + 1}.` : '•'}</Text>
              <Text style={{ color: theme.textSecondary, fontSize: 14, flex: 1, lineHeight: 20 }}>{item}</Text>
            </View>
          ))}
        </View>
      );
    case 'quote':
      return (
        <View style={[styles.quote, { borderColor: theme.accent }]}>
          <Text style={{ color: theme.textSecondary, fontSize: 14, fontStyle: 'italic', lineHeight: 20 }}>{block.text}</Text>
          {!!block.attribution && <Text style={{ color: theme.textSecondary, fontSize: 12, marginTop: 4 }}>{block.attribution}</Text>}
        </View>
      );
    case 'spacer':
      return <View style={{ height: SPACER_HEIGHT[block.size] }} />;
    case 'columns':
      return (
        <View style={styles.columnsRow}>
          {block.columns.map((col, i) => (
            <View key={i} style={styles.column}>
              {col.map((child) => <BlockView key={child.id} block={child} />)}
            </View>
          ))}
        </View>
      );
    default:
      return null;
  }
}

export function PageBlocks({ blocks }: { blocks: PageBlock[] }) {
  return (
    <View style={styles.container}>
      {blocks.map((block) => <BlockView key={block.id} block={block} />)}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 16 },
  image: { width: '100%', height: 200, borderRadius: 16 },
  button: { alignSelf: 'flex-start', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 999 },
  buttonDisabled: { alignSelf: 'flex-start', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 999 },
  divider: { height: StyleSheet.hairlineWidth },
  listRow: { flexDirection: 'row', gap: 8 },
  quote: { borderLeftWidth: 3, paddingLeft: 12 },
  columnsRow: { flexDirection: 'row', gap: 16 },
  column: { flex: 1, gap: 12 },
});
