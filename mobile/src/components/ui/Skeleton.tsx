import { useEffect, useRef } from 'react';
import { Animated, View, type ViewStyle } from 'react-native';

import { radius, useTheme } from '@/theme';

/** A softly pulsing placeholder block shown while content loads. */
export function Skeleton({ width = '100%', height = 14, round, style }: { width?: ViewStyle['width']; height?: number; round?: boolean; style?: ViewStyle }) {
  const { colors } = useTheme();
  const pulse = useRef(new Animated.Value(0.55)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.55, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <Animated.View
      style={[
        { width, height, borderRadius: round ? height / 2 : radius.sm, backgroundColor: colors.surfaceAlt, opacity: pulse },
        style,
      ]}
    />
  );
}

/** List placeholder: rows of avatar + two text lines. */
export function SkeletonList({ rows = 7, avatar = true }: { rows?: number; avatar?: boolean }) {
  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 8, gap: 18 }} accessibilityLabel="Loading" accessible>
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {avatar ? <Skeleton width={44} height={44} round /> : null}
          <View style={{ flex: 1, gap: 8 }}>
            <Skeleton width={`${55 + ((i * 13) % 30)}%`} height={14} />
            <Skeleton width={`${70 + ((i * 7) % 25)}%`} height={12} />
          </View>
        </View>
      ))}
    </View>
  );
}
