import { useLocalSearchParams } from 'expo-router';

import { ConversationThread } from '@/components/chat/ConversationThread';

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ConversationThread conversationId={String(id)} />;
}
