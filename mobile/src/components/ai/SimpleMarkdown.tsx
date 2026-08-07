import { Fragment } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { marked, type Token, type Tokens } from 'marked';

import { useTheme } from '@/hooks/use-theme';

// Renders the AI assistant's markdown replies natively. app/api/ai/chat/
// route.ts's SYSTEM_PROMPT only ever asks the model for headings, bold
// text, and lists (see its own "Format with real markdown" guideline) --
// lib/renderMarkdown.ts on the web app handles the full CommonMark surface
// via marked + dangerouslySetInnerHTML, neither of which exist in React
// Native. This walks marked's token tree (same parser, no HTML string in
// between) and renders just the token types that guideline actually
// produces, plus a few more (code, blockquote, links) that cost nothing
// extra to support. Falls back to plain text for anything unhandled rather
// than dropping content silently.
function renderInline(tokens: Token[], theme: ReturnType<typeof useTheme>, keyPrefix: string) {
  return tokens.map((token, i) => {
    const key = `${keyPrefix}-${i}`;
    switch (token.type) {
      case 'strong':
        return (
          <Text key={key} style={{ fontWeight: '800' }}>
            {renderInline((token as Tokens.Strong).tokens, theme, key)}
          </Text>
        );
      case 'em':
        return (
          <Text key={key} style={{ fontStyle: 'italic' }}>
            {renderInline((token as Tokens.Em).tokens, theme, key)}
          </Text>
        );
      case 'codespan':
        return (
          <Text key={key} style={[styles.code, { backgroundColor: theme.backgroundSelected, color: theme.text }]}>
            {(token as Tokens.Codespan).text}
          </Text>
        );
      case 'link':
        return (
          <Text key={key} style={{ color: theme.accent, textDecorationLine: 'underline' }}>
            {renderInline((token as Tokens.Link).tokens ?? [], theme, key)}
          </Text>
        );
      case 'br':
        return '\n';
      default:
        return <Fragment key={key}>{'text' in token ? (token as Tokens.Text).text : ''}</Fragment>;
    }
  });
}

function renderBlock(tokens: Token[], theme: ReturnType<typeof useTheme>, keyPrefix: string): React.ReactNode[] {
  return tokens.map((token, i) => {
    const key = `${keyPrefix}-${i}`;
    switch (token.type) {
      case 'heading': {
        const h = token as Tokens.Heading;
        const size = h.depth === 1 ? 18 : h.depth === 2 ? 16 : 15;
        return (
          <Text key={key} style={[styles.heading, { color: theme.text, fontSize: size }]}>
            {renderInline(h.tokens, theme, key)}
          </Text>
        );
      }
      case 'paragraph': {
        const p = token as Tokens.Paragraph;
        return (
          <Text key={key} style={[styles.paragraph, { color: theme.text }]}>
            {renderInline(p.tokens, theme, key)}
          </Text>
        );
      }
      case 'list': {
        const l = token as Tokens.List;
        return (
          <View key={key} style={styles.list}>
            {l.items.map((item, ii) => {
              // Tight list items (the common case -- no blank lines between
              // bullets) wrap their inline content in a single 'text' token
              // whose own .tokens holds the real inline children; loose
              // items use a 'paragraph' token instead. Either way, anything
              // that isn't itself inline text (chiefly a nested 'list', for
              // sub-bullets) is rendered as its own block below the line.
              const inlineTokens: Token[] = [];
              const nestedBlocks: Token[] = [];
              for (const t of item.tokens) {
                if (t.type === 'text' && 'tokens' in t && t.tokens) inlineTokens.push(...t.tokens);
                else if (t.type === 'paragraph') inlineTokens.push(...(t as Tokens.Paragraph).tokens);
                else if (t.type === 'text') inlineTokens.push(t);
                else nestedBlocks.push(t);
              }
              return (
                <View key={`${key}-${ii}`} style={styles.listItem}>
                  <Text style={[styles.listBullet, { color: theme.textSecondary }]}>
                    {l.ordered ? `${(l.start === '' ? 1 : Number(l.start)) + ii}.` : '•'}
                  </Text>
                  <View style={{ flex: 1 }}>
                    {inlineTokens.length > 0 && (
                      <Text style={[styles.paragraph, { color: theme.text, marginBottom: nestedBlocks.length ? 4 : 0 }]}>
                        {renderInline(inlineTokens, theme, `${key}-${ii}`)}
                      </Text>
                    )}
                    {nestedBlocks.length > 0 && renderBlock(nestedBlocks, theme, `${key}-${ii}-nested`)}
                  </View>
                </View>
              );
            })}
          </View>
        );
      }
      case 'code': {
        const c = token as Tokens.Code;
        return (
          <View key={key} style={[styles.codeBlock, { backgroundColor: theme.backgroundSelected, borderColor: theme.border }]}>
            <Text style={[styles.code, { color: theme.text }]}>{c.text}</Text>
          </View>
        );
      }
      case 'blockquote': {
        const b = token as Tokens.Blockquote;
        return (
          <View key={key} style={[styles.blockquote, { borderColor: theme.border }]}>
            {renderBlock(b.tokens, theme, key)}
          </View>
        );
      }
      case 'space':
        return null;
      default:
        return 'raw' in token ? (
          <Text key={key} style={[styles.paragraph, { color: theme.text }]}>
            {(token as Tokens.Text).raw}
          </Text>
        ) : null;
    }
  });
}

export function SimpleMarkdown({ text }: { text: string }) {
  const theme = useTheme();
  if (!text) return null;
  const tokens = marked.lexer(text);
  return <>{renderBlock(tokens, theme, 'md')}</>;
}

const styles = StyleSheet.create({
  heading: { fontWeight: '800', marginTop: 10, marginBottom: 4 },
  paragraph: { fontSize: 15, lineHeight: 22, marginBottom: 8 },
  list: { marginBottom: 8, gap: 4 },
  listItem: { flexDirection: 'row', gap: 8 },
  listBullet: { fontSize: 15, lineHeight: 22 },
  code: { fontFamily: Platform.select({ ios: 'Courier', android: 'monospace', default: 'monospace' }), fontSize: 13 },
  codeBlock: { borderRadius: 10, borderWidth: 1, padding: 10, marginBottom: 8 },
  blockquote: { borderLeftWidth: 2, paddingLeft: 10, marginBottom: 8 },
});
