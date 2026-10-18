import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/Text';
import { useTheme } from '@/theme';

type Kind = 'success' | 'error' | 'info';

/**
 * Tiny per-screen snackbar. `const { show, node } = useSnack()` then render `{node}` once
 * at the end of the screen. No global provider needed.
 */
export function useSnack() {
  const [msg, setMsg] = useState<{ text: string; kind: Kind; id: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((text: string, kind: Kind = 'info') => {
    if (timer.current) clearTimeout(timer.current);
    setMsg({ text, kind, id: Date.now() });
    timer.current = setTimeout(() => setMsg(null), 3200);
  }, []);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return { show, node: msg ? <SnackView key={msg.id} text={msg.text} kind={msg.kind} /> : null };
}

function SnackView({ text, kind }: { text: string; kind: Kind }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }).start();
  }, [opacity]);
  const bg = kind === 'error' ? colors.danger : kind === 'success' ? colors.primary : colors.text;
  const fg = kind === 'info' ? colors.background : '#ffffff';
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { justifyContent: 'flex-end', alignItems: 'center', paddingBottom: insets.bottom + 72 }]}>
      <Animated.View style={{ opacity, backgroundColor: bg, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, maxWidth: 420, marginHorizontal: 16 }}>
        <Text variant="label" color={fg} accessibilityLiveRegion="polite">
          {text}
        </Text>
      </Animated.View>
    </View>
  );
}
