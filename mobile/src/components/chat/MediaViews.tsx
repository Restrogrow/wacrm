import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/Text';
import { openMedia, useMediaSource } from '@/features/inbox/media';
import { useTheme } from '@/theme';

export function ImageMessage({ url, alt }: { url: string; alt: string }) {
  const { colors } = useTheme();
  const source = useMediaSource(url);
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const size = Math.min(260, width * 0.62);

  if (!source || failed) return <Unavailable label="Photo" />;
  const img = { uri: source.uri, headers: source.headers };
  return (
    <>
      <Pressable onPress={() => setOpen(true)} accessibilityRole="imagebutton" accessibilityLabel={alt}>
        <Image source={img} style={{ width: size, height: size * 0.8, borderRadius: 12, backgroundColor: colors.surfaceAlt }} contentFit="cover" transition={150} onError={() => setFailed(true)} />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)} statusBarTranslucent>
        <View style={styles.lightbox}>
          <Image source={img} style={StyleSheet.absoluteFill} contentFit="contain" />
          <Pressable onPress={() => setOpen(false)} style={[styles.close, { top: insets.top + 12 }]} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close photo">
            <Ionicons name="close" size={28} color="#fff" />
          </Pressable>
        </View>
      </Modal>
    </>
  );
}

export function AudioMessage({ url, mine }: { url: string; mine: boolean }) {
  const { colors } = useTheme();
  const source = useMediaSource(url);
  if (!source) return <Unavailable label="Voice message" />;
  return <AudioPlayer uri={source.uri} headers={source.headers} fg={mine ? colors.text : colors.text} />;
}

function fmt(sec: number) {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function AudioPlayer({ uri, headers, fg }: { uri: string; headers?: Record<string, string>; fg: string }) {
  const { colors } = useTheme();
  const player = useAudioPlayer({ uri, headers });
  const status = useAudioPlayerStatus(player);
  const loading = !status.isLoaded;
  const progress = status.duration ? Math.min(1, status.currentTime / status.duration) : 0;
  return (
    <View style={styles.audio}>
      <Pressable
        onPress={() => {
          if (status.playing) player.pause();
          else {
            if (status.didJustFinish || (status.duration && status.currentTime >= status.duration - 0.2)) player.seekTo(0);
            player.play();
          }
        }}
        accessibilityRole="button"
        accessibilityLabel={status.playing ? 'Pause voice message' : 'Play voice message'}
        style={[styles.playBtn, { backgroundColor: colors.primary }]}
      >
        {loading ? <ActivityIndicator color={colors.onPrimary} size="small" /> : <Ionicons name={status.playing ? 'pause' : 'play'} size={20} color={colors.onPrimary} />}
      </Pressable>
      <View style={{ flex: 1, gap: 4 }}>
        <View style={[styles.track, { backgroundColor: colors.border }]}>
          <View style={{ height: 4, borderRadius: 2, width: `${progress * 100}%`, backgroundColor: colors.primary }} />
        </View>
        <Text variant="caption" color={fg} style={{ opacity: 0.7 }}>
          {fmt(status.playing || status.currentTime ? status.currentTime : status.duration)}
        </Text>
      </View>
    </View>
  );
}

export function FileMessage({ url, label, icon, name }: { url: string; label: string; icon: keyof typeof Ionicons.glyphMap; name?: string }) {
  const { colors } = useTheme();
  const source = useMediaSource(url);
  const [busy, setBusy] = useState(false);
  if (!source) return <Unavailable label={label} />;
  return (
    <Pressable
      onPress={async () => {
        setBusy(true);
        try {
          await openMedia(source, name ?? label);
        } catch {
          /* nothing to do: the user can try again */
        } finally {
          setBusy(false);
        }
      }}
      accessibilityRole="button"
      accessibilityLabel={`Open ${label}`}
      style={[styles.file, { backgroundColor: colors.surfaceAlt }]}
    >
      {busy ? <ActivityIndicator color={colors.primary} /> : <Ionicons name={icon} size={26} color={colors.primary} />}
      <View style={{ flex: 1 }}>
        <Text variant="label" numberOfLines={1}>
          {name || label}
        </Text>
        <Text variant="caption" muted>
          Tap to open
        </Text>
      </View>
    </Pressable>
  );
}

export function Unavailable({ label }: { label: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.file, { backgroundColor: colors.surfaceAlt }]}>
      <Ionicons name="alert-circle-outline" size={22} color={colors.textMuted} />
      <Text variant="caption" muted>
        {label} unavailable
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  lightbox: { flex: 1, backgroundColor: '#000' },
  close: { position: 'absolute', right: 16, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  audio: { flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 200 },
  playBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  track: { height: 4, borderRadius: 2, overflow: 'hidden' },
  file: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 12, minWidth: 200 },
});
