import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomSheet, SheetRow } from '@/components/chat/BottomSheet';
import { TemplatePreview } from '@/components/chat/TemplatePreview';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/misc';
import { Text } from '@/components/ui/Text';
import { createBroadcast, paramsFor, resolveAudience, variableSlots, type Audience, type VariableChoice } from '@/features/broadcasts/data';
import { loadTags, type Tag } from '@/features/contacts/data';
import { renderTemplateBody } from '@/features/inbox/format';
import { fetchApprovedTemplates } from '@/features/inbox/queries';
import type { MessageTemplate } from '@/features/inbox/types';
import { ScreenHeader } from '@/features/settings/ScreenHeader';
import { useSession } from '@/providers/session';
import { useTheme } from '@/theme';

type When = 'now' | 'hour' | 'tomorrow';

function sendTime(when: When): Date {
  const d = new Date();
  if (when === 'now') return new Date(d.getTime() + 60_000);
  if (when === 'hour') return new Date(d.getTime() + 60 * 60_000);
  const t = new Date(d);
  t.setDate(t.getDate() + 1);
  t.setHours(10, 0, 0, 0);
  return t;
}

function Section({ step, title, children }: { step: number; title: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
          <Text variant="caption" color={colors.onPrimary} style={{ fontWeight: '800' }}>
            {step}
          </Text>
        </View>
        <Text variant="heading">{title}</Text>
      </View>
      {children}
    </View>
  );
}

function Choice({ label, hint, on, onPress, icon }: { label: string; hint?: string; on: boolean; onPress: () => void; icon: keyof typeof Ionicons.glyphMap }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
      style={{
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        padding: 12,
        borderRadius: 14,
        borderWidth: 1.5,
        borderColor: on ? colors.primary : colors.border,
        backgroundColor: on ? colors.primarySoft : colors.surface,
      }}
    >
      <Ionicons name={icon} size={20} color={on ? colors.primary : colors.textMuted} />
      <View style={{ flex: 1 }}>
        <Text variant="label" color={on ? colors.primary : colors.text}>
          {label}
        </Text>
        {hint ? (
          <Text variant="caption" muted numberOfLines={1}>
            {hint}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export default function NewBroadcast() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { accountId, session, canWrite } = useSession();

  const [name, setName] = useState(() => `Broadcast ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`);
  const [templates, setTemplates] = useState<MessageTemplate[] | null>(null);
  const [template, setTemplate] = useState<MessageTemplate | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [tags, setTags] = useState<Tag[]>([]);
  const [audienceType, setAudienceType] = useState<'all' | 'tags'>('all');
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [count, setCount] = useState<number | null>(null);
  const [counting, setCounting] = useState(false);
  const [choices, setChoices] = useState<Record<number, VariableChoice>>({});
  const [when, setWhen] = useState<When>('now');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetchApprovedTemplates().then(setTemplates).catch(() => setTemplates([]));
    loadTags().then(setTags).catch(() => setTags([]));
  }, []);

  const audience: Audience = useMemo(() => (audienceType === 'all' ? { type: 'all' } : { type: 'tags', tagIds }), [audienceType, tagIds]);

  // How many people this would reach (opted-out contacts excluded).
  useEffect(() => {
    let cancelled = false;
    setCounting(true);
    const t = setTimeout(() => {
      resolveAudience(audience)
        .then((c) => !cancelled && setCount(c.length))
        .catch(() => !cancelled && setCount(null))
        .finally(() => !cancelled && setCounting(false));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [audience]);

  const slots = template ? variableSlots(template) : [];

  function pick(t: MessageTemplate) {
    setTemplate(t);
    setPickerOpen(false);
    // Default: {{1}} is the contact's first name, the rest are fixed text.
    const next: Record<number, VariableChoice> = {};
    variableSlots(t).forEach((n, i) => (next[n] = i === 0 ? { kind: 'name', fallback: 'there' } : { kind: 'text', text: '' }));
    setChoices(next);
  }

  const preview = template ? renderTemplateBody(template.body_text, paramsFor({ name: 'Rahul Sharma' }, slots, choices)) : '';
  const missingText = slots.some((n) => choices[n]?.kind === 'text' && !(choices[n] as { text: string }).text.trim());
  const ready = !!template && name.trim() && !missingText && (count ?? 0) > 0 && !(audienceType === 'tags' && tagIds.length === 0);

  async function submit() {
    if (!template || !accountId || !session) return;
    const whenText = when === 'now' ? 'in about a minute' : when === 'hour' ? 'in 1 hour' : 'tomorrow at 10 AM';
    Alert.alert(`Send to ${count} ${count === 1 ? 'person' : 'people'}?`, `“${template.name.replace(/_/g, ' ')}” goes out ${whenText}. WhatsApp charges per message for marketing templates.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: when === 'now' ? 'Send' : 'Schedule',
        onPress: async () => {
          setSending(true);
          try {
            const res = await createBroadcast({ accountId, userId: session.user.id, name, template, audience, choices, sendAt: sendTime(when) });
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            router.replace(`/broadcasts/${res.id}`);
          } catch (e) {
            Alert.alert('Broadcast not saved', e instanceof Error ? e.message : 'Try again.');
          } finally {
            setSending(false);
          }
        },
      },
    ]);
  }

  if (!canWrite) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader title="New broadcast" />
        <Text muted style={{ padding: 16 }}>
          Viewers can’t send broadcasts. Ask an admin for agent access.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="New broadcast" />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 24, paddingBottom: insets.bottom + 32, width: '100%', maxWidth: 760, alignSelf: 'center' }}>
        <Input label="Name (only you see this)" value={name} onChangeText={setName} maxLength={80} />

        <Section step={1} title="Message">
          {template ? (
            <View style={{ gap: 10 }}>
              <TemplatePreview template={template} body={preview} />
              <Button small variant="secondary" icon="swap-horizontal" title="Change template" onPress={() => setPickerOpen(true)} />
            </View>
          ) : (
            <Card onPress={() => setPickerOpen(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Ionicons name="document-text-outline" size={22} color={colors.primary} />
              <Text style={{ flex: 1 }}>Choose an approved template</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </Card>
          )}
        </Section>

        {template && slots.length ? (
          <Section step={2} title="Fill the blanks">
            {slots.map((n) => {
              const c = choices[n] ?? { kind: 'text', text: '' };
              return (
                <Card key={n} style={{ gap: 10 }}>
                  <Text variant="label">{`{{${n}}}`}</Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Choice icon="person-outline" label="Contact’s name" on={c.kind === 'name'} onPress={() => setChoices((p) => ({ ...p, [n]: { kind: 'name', fallback: 'there' } }))} />
                    <Choice icon="text-outline" label="Same text" on={c.kind === 'text'} onPress={() => setChoices((p) => ({ ...p, [n]: { kind: 'text', text: '' } }))} />
                  </View>
                  {c.kind === 'name' ? (
                    <Input label="If a contact has no name, use" value={c.fallback} onChangeText={(v) => setChoices((p) => ({ ...p, [n]: { kind: 'name', fallback: v } }))} />
                  ) : (
                    <Input label="Text for everyone" value={c.text} onChangeText={(v) => setChoices((p) => ({ ...p, [n]: { kind: 'text', text: v } }))} placeholder="Type the value" />
                  )}
                </Card>
              );
            })}
          </Section>
        ) : null}

        <Section step={template && slots.length ? 3 : 2} title="Who gets it">
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Choice icon="people-outline" label="All contacts" on={audienceType === 'all'} onPress={() => setAudienceType('all')} />
            <Choice icon="pricetags-outline" label="By tag" on={audienceType === 'tags'} onPress={() => setAudienceType('tags')} />
          </View>
          {audienceType === 'tags' ? (
            tags.length ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {tags.map((t) => {
                  const on = tagIds.includes(t.id);
                  return (
                    <Pressable
                      key={t.id}
                      onPress={() => setTagIds((p) => (on ? p.filter((x) => x !== t.id) : [...p, t.id]))}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}
                      style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, borderWidth: 1.5, borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primarySoft : 'transparent' }}
                    >
                      <Text variant="caption" color={on ? colors.primary : colors.text} style={{ fontWeight: '700' }}>
                        {on ? '✓ ' : ''}
                        {t.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <Text muted>You have no tags yet. Add tags to contacts first.</Text>
            )
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {counting ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="people" size={16} color={colors.primary} />}
            <Text variant="label" color={colors.primary}>
              {counting ? 'Counting…' : count === null ? '–' : `${count} ${count === 1 ? 'person' : 'people'}`}
            </Text>
            <Text variant="caption" muted>
              (opted-out contacts are skipped)
            </Text>
          </View>
        </Section>

        <Section step={template && slots.length ? 4 : 3} title="When">
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Choice icon="flash-outline" label="Now" on={when === 'now'} onPress={() => setWhen('now')} />
            <Choice icon="time-outline" label="In 1 hour" on={when === 'hour'} onPress={() => setWhen('hour')} />
          </View>
          <Choice icon="sunny-outline" label="Tomorrow, 10 AM" on={when === 'tomorrow'} onPress={() => setWhen('tomorrow')} />
          <Text variant="caption" muted>
            Our server sends it, so you can close the app.
          </Text>
        </Section>

        <Button title={when === 'now' ? 'Send broadcast' : 'Schedule broadcast'} icon="paper-plane-outline" loading={sending} disabled={!ready} onPress={submit} />
      </ScrollView>

      <BottomSheet visible={pickerOpen} onClose={() => setPickerOpen(false)} title="Choose a template">
        {templates === null ? (
          <ActivityIndicator color={colors.primary} style={{ padding: 24 }} />
        ) : templates.length === 0 ? (
          <Text muted style={{ padding: 12 }}>
            No approved templates yet. Create one on the website under Templates; Meta reviews it, usually within minutes.
          </Text>
        ) : (
          templates.map((t) => <SheetRow key={t.id} icon="document-text-outline" label={t.name.replace(/_/g, ' ')} hint={t.body_text} selected={template?.id === t.id} onPress={() => pick(t)} />)
        )}
      </BottomSheet>
    </View>
  );
}
