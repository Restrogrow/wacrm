import { useState } from 'react';
import { ActivityIndicator, Alert, View } from 'react-native';

import { BottomSheet, SheetRow } from '@/components/chat/BottomSheet';
import { Text } from '@/components/ui/Text';
import type { InboxConversation, Member } from '@/features/inbox/types';
import { api, ApiError } from '@/lib/api';
import { useTheme } from '@/theme';

type Panel = 'main' | 'assign' | 'summary';

export function ActionsSheet({
  visible,
  onClose,
  conversation,
  members,
  userId,
  canWrite,
  onStatus,
  onAssign,
  onMarkUnread,
  onViewContact,
}: {
  visible: boolean;
  onClose: () => void;
  conversation: InboxConversation;
  members: Member[];
  userId: string | null;
  canWrite: boolean;
  onStatus: (s: 'open' | 'pending' | 'closed') => void;
  onAssign: (id: string | null) => void;
  onMarkUnread: () => void;
  onViewContact: () => void;
}) {
  const { colors } = useTheme();
  const [panel, setPanel] = useState<Panel>('main');
  const [summary, setSummary] = useState<string | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);

  function close() {
    setPanel('main');
    onClose();
  }

  async function summarize() {
    setPanel('summary');
    setSummary(null);
    setLoadingSummary(true);
    try {
      const res = await api<{ summary: string }>(`/api/inbox/conversations/${conversation.id}/summary`, { method: 'POST', body: {} });
      setSummary(res.summary);
    } catch (e) {
      setPanel('main');
      const message =
        e instanceof ApiError && (e.code === 'ai_not_configured' || /not configured/i.test(e.message))
          ? 'AI is not set up for this workspace yet.'
          : e instanceof Error
            ? e.message
            : 'Please try again.';
      Alert.alert('Could not summarise this chat', message);
    } finally {
      setLoadingSummary(false);
    }
  }

  const title = panel === 'assign' ? 'Assign chat to' : panel === 'summary' ? 'Chat summary' : 'Chat actions';
  const assignable = members.filter((m) => m.account_role !== 'viewer');

  return (
    <BottomSheet visible={visible} onClose={close} title={title}>
      {panel === 'summary' ? (
        loadingSummary ? (
          <View style={{ padding: 24, alignItems: 'center', gap: 8 }}>
            <ActivityIndicator color={colors.primary} />
            <Text muted>Reading the conversation...</Text>
          </View>
        ) : (
          <Text style={{ paddingVertical: 8 }}>{summary}</Text>
        )
      ) : panel === 'assign' ? (
        <>
          {userId ? <SheetRow icon="person-outline" label="Me" selected={conversation.assigned_agent_id === userId} onPress={() => onAssign(userId)} /> : null}
          {assignable
            .filter((m) => m.user_id !== userId)
            .map((m) => (
              <SheetRow key={m.user_id} icon="person-outline" label={m.full_name || m.email || 'Teammate'} hint={m.account_role ?? undefined} selected={conversation.assigned_agent_id === m.user_id} onPress={() => onAssign(m.user_id)} />
            ))}
          {conversation.assigned_agent_id ? <SheetRow icon="person-remove-outline" label="Unassign" onPress={() => onAssign(null)} /> : null}
        </>
      ) : (
        <>
          <SheetRow icon="person-circle-outline" label="View contact" onPress={onViewContact} />
          {canWrite ? (
            <>
              <SheetRow icon="swap-horizontal-outline" label="Assign to..." hint={conversation.assigned_agent_id === userId ? 'Assigned to you' : undefined} onPress={() => setPanel('assign')} />
              {conversation.status !== 'open' ? <SheetRow icon="radio-button-on-outline" label="Mark as open" onPress={() => onStatus('open')} /> : null}
              {conversation.status !== 'pending' ? <SheetRow icon="time-outline" label="Mark as pending" onPress={() => onStatus('pending')} /> : null}
              {conversation.status !== 'closed' ? <SheetRow icon="checkmark-circle-outline" label="Close chat" onPress={() => onStatus('closed')} /> : null}
              <SheetRow icon="mail-unread-outline" label="Mark as unread" onPress={onMarkUnread} />
            </>
          ) : null}
          <SheetRow icon="sparkles-outline" label="Summarise this chat" hint="AI recap for handover" onPress={summarize} />
        </>
      )}
    </BottomSheet>
  );
}
