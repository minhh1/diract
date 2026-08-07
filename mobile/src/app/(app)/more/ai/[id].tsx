import { ActivityIndicator, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { useTheme } from '@/hooks/use-theme';
import { fetchConversationMessages } from '@/lib/aiChat';
import { AiChatThread } from '@/components/ai/AiChatThread';

// A conversationId with no messages yet (just tapped "New chat" in
// ai/index.tsx) doesn't exist as an ai_conversations row server-side until
// its first send -- app/api/ai/chat/route.ts creates it then. Fetching
// messages for one is a normal empty result, not an error, so this always
// queries and just treats "no messages" the same as "brand new."
export default function AiConversationScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();

  const { data: messages, isLoading } = useQuery({
    queryKey: ['ai-conversation-messages', id],
    queryFn: () => fetchConversationMessages(id),
    enabled: !!id,
  });

  if (isLoading || !id) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.background }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <AiChatThread
      conversationId={id}
      initialMessages={messages ?? []}
      onTurnComplete={() => queryClient.invalidateQueries({ queryKey: ['ai-conversations'] })}
    />
  );
}
