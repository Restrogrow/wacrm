import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';

import { PressableScale } from '@/components/ui/PressableScale';
import { Text } from '@/components/ui/Text';
import { fmtRelative } from '@/features/dashboard/fmt';
import { callLabel, callLength, isMissed, statusText, type CallRow } from '@/features/calls/data';
import { useTheme } from '@/theme';

export function CallListRow({ call, onPress, compact }: { call: CallRow; onPress: () => void; compact?: boolean }) {
  const { colors } = useTheme();
  const missed = isMissed(call);
  const icon = missed ? 'call' : call.direction === 'inbound' ? 'arrow-down' : 'arrow-up';
  const tint = missed ? colors.danger : call.direction === 'inbound' ? colors.info : colors.primary;
  const soft = missed ? colors.dangerSoft : call.direction === 'inbound' ? colors.infoSoft : colors.primarySoft;
  const length = callLength(call.duration_seconds);
  const summary = call.ai_notes?.summary;
  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.98}
      accessibilityRole="button"
      accessibilityLabel={`${statusText(call)} call, ${callLabel(call)}, ${fmtRelative(call.created_at)}${call.ai_agent ? ', handled by AI' : ''}`}
      style={{ flexDirection: 'row', gap: 12, paddingHorizontal: compact ? 0 : 16, paddingVertical: 12, alignItems: 'flex-start' }}
    >
      <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: soft, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={20} color={tint} />
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ fontWeight: '600', flexShrink: 1 }} numberOfLines={1} color={missed ? colors.danger : colors.text}>
            {callLabel(call)}
          </Text>
          {call.ai_agent ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colors.primarySoft, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 }}>
              <Ionicons name="sparkles" size={11} color={colors.primary} />
              <Text variant="caption" color={colors.primary} style={{ fontSize: 11, fontWeight: '700' }}>
                AI
              </Text>
            </View>
          ) : null}
          <View style={{ flex: 1 }} />
          <Text variant="caption" muted>
            {fmtRelative(call.created_at)}
          </Text>
        </View>
        <Text variant="caption" muted numberOfLines={1}>
          {statusText(call)}
          {length ? ` · ${length}` : ''}
        </Text>
        {summary ? (
          <Text variant="caption" numberOfLines={2} style={{ marginTop: 2 }}>
            {summary}
          </Text>
        ) : null}
      </View>
    </PressableScale>
  );
}
