import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { toStoredPhone } from '@/features/dashboard/fmt';
import { useSession } from '@/providers/session';
import { useTheme } from '@/theme';
import { createContact, describeSaveError, findDuplicate, type DuplicateHit, type Tag } from './data';
import { Sheet } from './Sheet';

export function AddContactSheet({
  visible,
  onClose,
  tags,
  onCreated,
  onOpenExisting,
}: {
  visible: boolean;
  onClose: () => void;
  tags: Tag[];
  onCreated: (id: string) => void;
  onOpenExisting: (id: string) => void;
}) {
  const { colors } = useTheme();
  const { accountId, session } = useSession();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [dup, setDup] = useState<DuplicateHit | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setName('');
    setPhone('');
    setEmail('');
    setCompany('');
    setTagIds([]);
    setDup(null);
    setError(null);
  }, [visible]);

  async function checkDup() {
    const stored = toStoredPhone(phone);
    if (!stored || !accountId) return setDup(null);
    setDup(await findDuplicate(accountId, stored));
  }

  async function save() {
    setError(null);
    if (!accountId || !session) return;
    if (!toStoredPhone(phone)) return setError('Enter a valid phone number with country code, e.g. +91 98765 43210.');
    if (email.trim() && !/^\S+@\S+\.\S+$/.test(email.trim())) return setError('That email address does not look right.');
    setSaving(true);
    try {
      const existing = await findDuplicate(accountId, toStoredPhone(phone)!);
      if (existing) {
        setDup(existing);
        setError('A contact with this phone number already exists.');
        return;
      }
      const id = await createContact({ accountId, userId: session.user.id, name, phoneRaw: phone, email, company, tagIds });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      onCreated(id);
    } catch (e) {
      setError(describeSaveError(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet visible={visible} onClose={onClose} title="New contact">
      <Input label="Name" value={name} onChangeText={setName} placeholder="Aarav Sharma" autoCapitalize="words" returnKeyType="next" />
      <Input
        label="WhatsApp number"
        value={phone}
        onChangeText={(v) => {
          setPhone(v);
          setDup(null);
        }}
        onBlur={checkDup}
        placeholder="+91 98765 43210"
        keyboardType="phone-pad"
        textContentType="telephoneNumber"
      />
      <Text variant="caption" muted style={{ marginTop: -8 }}>
        A 10-digit number is saved as +91. Add the country code for other countries.
      </Text>
      {dup ? (
        <Pressable onPress={() => onOpenExisting(dup.id)} style={{ backgroundColor: colors.warningSoft, borderRadius: 12, padding: 12 }}>
          <Text variant="label" color={colors.warning}>
            Already saved as {dup.name || dup.phone}. Tap to open.
          </Text>
        </Pressable>
      ) : null}
      <Input label="Email (optional)" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
      <Input label="Company (optional)" value={company} onChangeText={setCompany} autoCapitalize="words" />
      {tags.length > 0 ? (
        <View style={{ gap: 8 }}>
          <Text variant="label">Tags</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {tags.map((t) => {
              const on = tagIds.includes(t.id);
              return (
                <Pressable
                  key={t.id}
                  onPress={() => setTagIds((p) => (on ? p.filter((x) => x !== t.id) : [...p, t.id]))}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 7,
                    borderRadius: 999,
                    borderWidth: 1.5,
                    borderColor: on ? colors.primary : colors.border,
                    backgroundColor: on ? colors.primarySoft : 'transparent',
                  }}
                >
                  <Text variant="caption" color={on ? colors.primary : colors.text} style={{ fontWeight: '600' }}>
                    {t.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}
      {error ? (
        <Text variant="caption" color={colors.danger}>
          {error}
        </Text>
      ) : null}
      <Button title="Save contact" onPress={save} loading={saving} />
    </Sheet>
  );
}
