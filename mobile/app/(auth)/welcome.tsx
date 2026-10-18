import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { markOnboardingDone } from '@/features/auth/onboarding';
import { radius, useTheme } from '@/theme';

type IconName = keyof typeof Ionicons.glyphMap;

const SLIDES: { icon: IconName; accent: IconName[]; title: string; body: string }[] = [
  {
    icon: 'chatbubbles',
    accent: ['logo-whatsapp', 'people', 'checkmark-done'],
    title: 'One shared inbox for WhatsApp',
    body: 'Your whole team answers customers from one place. Assign chats, add private notes and never lose a conversation.',
  },
  {
    icon: 'git-network',
    accent: ['person-add', 'cash', 'trending-up'],
    title: 'Contacts and a simple sales pipeline',
    body: 'Every customer, their history and their deals in one tidy profile. Move deals forward with a tap.',
  },
  {
    icon: 'flash',
    accent: ['sparkles', 'time', 'send'],
    title: 'Automations and AI replies',
    body: 'Send away messages, follow-ups and reminders automatically. Get smart reply suggestions while you chat.',
  },
  {
    icon: 'stats-chart',
    accent: ['notifications', 'eye', 'ribbon'],
    title: 'Reports and never miss a lead',
    body: 'See response times and sales at a glance. Get alerts the moment a new customer writes in.',
  },
];

export default function Welcome() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const scrollX = useRef(new Animated.Value(0)).current;
  const scroller = useRef<{ scrollTo: (o: { x: number; animated?: boolean }) => void } | null>(null);
  const [index, setIndex] = useState(0);
  const last = index === SLIDES.length - 1;

  const finish = async (to: '/(auth)/signup' | '/(auth)/login') => {
    await markOnboardingDone();
    router.replace(to);
  };

  const goTo = (i: number) => {
    Haptics.selectionAsync().catch(() => {});
    scroller.current?.scrollTo({ x: i * width, animated: true });
  };

  const onEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    if (i !== index) {
      setIndex(i);
      Haptics.selectionAsync().catch(() => {});
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 16) }}>
      <View style={styles.top}>
        <View style={styles.brand}>
          <View style={[styles.logo, { backgroundColor: colors.primary }]}>
            <Ionicons name="logo-whatsapp" size={18} color={colors.onPrimary} />
          </View>
          <Text variant="heading">Repeat Grow</Text>
        </View>
        {!last ? (
          <Pressable onPress={() => finish('/(auth)/login')} hitSlop={12} accessibilityRole="button" accessibilityLabel="Skip introduction">
            <Text variant="label" color={colors.textMuted}>
              Skip
            </Text>
          </Pressable>
        ) : null}
      </View>

      <ScrollView
        ref={scroller as never}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={(e) => scrollX.setValue(e.nativeEvent.contentOffset.x)}
        scrollEventThrottle={16}
        onMomentumScrollEnd={onEnd}
        style={{ flex: 1 }}
      >
        {SLIDES.map((s, i) => {
          const input = [(i - 1) * width, i * width, (i + 1) * width];
          const scale = scrollX.interpolate({ inputRange: input, outputRange: [0.8, 1, 0.8], extrapolate: 'clamp' });
          const opacity = scrollX.interpolate({ inputRange: input, outputRange: [0, 1, 0], extrapolate: 'clamp' });
          return (
            <View key={s.title} style={{ width, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
              <View style={styles.slide}>
                <Animated.View style={[styles.art, { transform: [{ scale }], opacity }]}>
                  <View style={[styles.ring, { backgroundColor: colors.primarySoft }]} />
                  <View style={[styles.core, { backgroundColor: colors.primary }]}>
                    <Ionicons name={s.icon} size={54} color={colors.onPrimary} />
                  </View>
                  {s.accent.map((a, k) => (
                    <View
                      key={a}
                      style={[
                        styles.chip,
                        { backgroundColor: colors.surface, borderColor: colors.border },
                        k === 0 && { top: 6, left: 14 },
                        k === 1 && { top: 40, right: 0 },
                        k === 2 && { bottom: 10, left: 34 },
                      ]}
                    >
                      <Ionicons name={a} size={20} color={colors.primary} />
                    </View>
                  ))}
                </Animated.View>
                <Animated.View style={{ opacity, gap: 10 }}>
                  <Text variant="title" style={{ textAlign: 'center' }} accessibilityRole="header">
                    {s.title}
                  </Text>
                  <Text muted style={{ textAlign: 'center' }}>
                    {s.body}
                  </Text>
                </Animated.View>
              </View>
            </View>
          );
        })}
      </ScrollView>

      <View style={styles.bottom}>
        <View style={styles.dots} accessibilityLabel={`Step ${index + 1} of ${SLIDES.length}`}>
          {SLIDES.map((_, i) => {
            const input = [(i - 1) * width, i * width, (i + 1) * width];
            const w = scrollX.interpolate({ inputRange: input, outputRange: [8, 24, 8], extrapolate: 'clamp' });
            const o = scrollX.interpolate({ inputRange: input, outputRange: [0.35, 1, 0.35], extrapolate: 'clamp' });
            return <Animated.View key={i} style={{ width: w, opacity: o, height: 8, borderRadius: 4, backgroundColor: colors.primary }} />;
          })}
        </View>
        {last ? (
          <View style={{ gap: 10 }}>
            <Button title="Get started" onPress={() => finish('/(auth)/signup')} />
            <Button title="I already have an account" variant="ghost" onPress={() => finish('/(auth)/login')} />
          </View>
        ) : (
          <Button title="Next" icon="arrow-forward" onPress={() => goTo(index + 1)} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 8, minHeight: 44 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logo: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  slide: { width: '100%', maxWidth: 520, alignItems: 'center', gap: 28 },
  art: { width: 230, height: 230, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: 220, height: 220, borderRadius: 110 },
  core: { width: 128, height: 128, borderRadius: 40, alignItems: 'center', justifyContent: 'center' },
  chip: { position: 'absolute', width: 44, height: 44, borderRadius: radius.lg, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  bottom: { paddingHorizontal: 20, gap: 20, width: '100%', maxWidth: 560, alignSelf: 'center' },
  dots: { flexDirection: 'row', gap: 6, alignSelf: 'center', alignItems: 'center' },
});
