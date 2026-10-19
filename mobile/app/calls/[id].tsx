import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Share, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { Avatar, Badge, Card, EmptyState, ErrorView, LoadingView } from '@/components/ui/misc';
import { Text } from '@/components/ui/Text';
import { callLabel, callLength, fetchCall, isMissed, statusText, subscribeCalls, type CallRow } from '@/features/calls/data';
import { fmtDateTime } from '@/features/dashboard/fmt';
import { ScreenHeader } from '@/features/settings/ScreenHeader';
import { useTheme } from '@/theme';

const MOOD = { happy: ['Happy', 'success'], neutral: ['Neutral', 'neutral'], unhappy: ['Unhappy', 'danger'] } as const;

function notesText(call: CallRow): string {
  const n = call.ai_notes;
  if (!n) return '';
  const lines = [`Call with ${callLabel(call)} · ${fmtDateTime(call.created_at)}`, '', n.summary];
  if (n.customer_wants) lines.push('', `Customer wants: ${n.customer_wants}`);
  if (n.action_items.length) lines.push('', 'To do:', ...n.action_items.map((a) => `• ${a}`));
  if (n.follow_up) lines.push('', `Follow up: ${n.follow_up}`);
  return lines.join('\n');
}

function Row({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Ionicons name={icon} size={18} color={colors.textMuted} />
      <Text muted style={{ width: 92 }}>
        {label}
      </Text>
      <Text style={{ flex: 1, textAlign: 'right' }}>{value}</Text>
    </View>
  );
}

export default function CallDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [call, setCall] = useState<CallRow | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setError(null);
      setCall(await fetchCall(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load this call.');
    }
  }, [id]);

  useEffect(() => {
    void load();
    // AI notes arrive a little after the call ends.
    return subscribeCalls(() => void load());
  }, [load]);

  if (call === undefined && !error) return <LoadingView />;
  if (!call) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader title="Call" />
        {error ? <ErrorView message={error} onRetry={load} /> : <EmptyState icon="call-outline" title="Call not found" />}
      </View>
    );
  }

  const n = call.ai_notes;
  const missed = isMissed(call);
  const length = callLength(call.duration_seconds);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="Call" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 18, paddingBottom: insets.bottom + 32, width: '100%', maxWidth: 760, alignSelf: 'center' }}>
        <View style={{ alignItems: 'center', gap: 8 }}>
          <Avatar name={callLabel(call)} size={72} />
          <Text variant="title" style={{ textAlign: 'center' }}>
            {callLabel(call)}
          </Text>
          {call.customer_name && call.customer_number ? <Text muted>+{call.customer_number.replace(/^\+/, '')}</Text> : null}
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
            <Badge label={statusText(call)} tone={missed ? 'danger' : call.direction === 'inbound' ? 'info' : 'success'} />
            {call.ai_agent ? <Badge label="Handled by AI" tone="success" /> : null}
          </View>
        </View>

        <Card style={{ gap: 12 }}>
          <Row icon={call.direction === 'inbound' ? 'arrow-down-outline' : 'arrow-up-outline'} label="Direction" value={call.direction === 'inbound' ? 'Customer called you' : 'You called them'} />
          <Row icon="time-outline" label="When" value={fmtDateTime(call.created_at)} />
          <Row icon="hourglass-outline" label="Length" value={length ?? (missed ? 'Not answered' : '–')} />
        </Card>

        {n ? (
          <View style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="sparkles" size={16} color={colors.primary} />
              <Text variant="label" muted style={{ textTransform: 'uppercase', letterSpacing: 0.6, flex: 1 }}>
                AI call notes
              </Text>
              <Badge label={MOOD[n.mood]?.[0] ?? 'Neutral'} tone={MOOD[n.mood]?.[1] ?? 'neutral'} />
            </View>
            <Card style={{ gap: 14 }}>
              <Text selectable>{n.summary}</Text>
              {n.customer_wants ? (
                <View style={{ gap: 4 }}>
                  <Text variant="label" muted>
                    Customer wants
                  </Text>
                  <Text selectable>{n.customer_wants}</Text>
                </View>
              ) : null}
              {n.action_items.length ? (
                <View style={{ gap: 6 }}>
                  <Text variant="label" muted>
                    To do
                  </Text>
                  {n.action_items.map((a, i) => (
                    <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
                      <Ionicons name="checkbox-outline" size={18} color={colors.primary} />
                      <Text style={{ flex: 1 }} selectable>
                        {a}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}
              {n.follow_up ? (
                <View style={{ gap: 4 }}>
                  <Text variant="label" muted>
                    Follow up
                  </Text>
                  <Text selectable>{n.follow_up}</Text>
                </View>
              ) : null}
              {n.customer_language ? (
                <Text variant="caption" muted>
                  Language: {n.customer_language}
                </Text>
              ) : null}
            </Card>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button
                small
                variant="secondary"
                icon={copied ? 'checkmark' : 'copy-outline'}
                title={copied ? 'Copied' : 'Copy notes'}
                style={{ flex: 1 }}
                onPress={async () => {
                  await Clipboard.setStringAsync(notesText(call));
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
              />
              <Button small variant="secondary" icon="share-outline" title="Share" style={{ flex: 1 }} onPress={() => Share.share({ message: notesText(call) }).catch(() => {})} />
            </View>
          </View>
        ) : !missed && call.duration_seconds ? (
          <Card style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <Ionicons name="information-circle-outline" size={20} color={colors.textMuted} />
            <Text muted style={{ flex: 1 }}>
              No AI notes for this call. Switch on AI notes during a call on the web dashboard (AI calls record them automatically).
            </Text>
          </Card>
        ) : null}

        <View style={{ gap: 10 }}>
          {call.conversation_id ? <Button title="Open chat" icon="chatbubbles-outline" onPress={() => router.push(`/chat/${call.conversation_id}`)} /> : null}
          {call.contact_id ? <Button title="Open contact" variant="secondary" icon="person-outline" onPress={() => router.push(`/contact/${call.contact_id}`)} /> : null}
        </View>
      </ScrollView>
    </View>
  );
}
