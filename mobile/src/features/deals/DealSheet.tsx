import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/misc';
import { Text } from '@/components/ui/Text';
import { Sheet } from '@/features/contacts/Sheet';
import { fmtMoney, fmtPhone } from '@/features/dashboard/fmt';
import { useSession } from '@/providers/session';
import { useTheme } from '@/theme';
import {
  createDeal,
  deleteDeal,
  moveDeal,
  setDealStatus,
  updateDeal,
  type Deal,
  type DealStatus,
  type Pipeline,
} from './data';

function errText(e: unknown): string {
  const m = (e as { message?: string } | null)?.message;
  return m || 'Something went wrong. Please try again.';
}

/** Create (deal === null, contactId set) or edit a deal. */
export function DealSheet({
  visible,
  onClose,
  onChanged,
  deal,
  pipelines,
  newForContact,
  notify,
}: {
  visible: boolean;
  onClose: () => void;
  onChanged: () => void;
  deal: Deal | null;
  pipelines: Pipeline[];
  newForContact?: { id: string; pipelineId?: string } | null;
  notify: (msg: string, kind?: 'success' | 'error' | 'info') => void;
}) {
  const { colors } = useTheme();
  const { canWrite, isAdmin, accountId, session } = useSession();
  const [title, setTitle] = useState('');
  const [value, setValue] = useState('');
  const [notes, setNotes] = useState('');
  const [stageId, setStageId] = useState('');
  const [pipelineId, setPipelineId] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const pipeline = pipelines.find((p) => p.id === (deal?.pipeline_id ?? pipelineId)) ?? pipelines[0];

  useEffect(() => {
    if (!visible) return;
    if (deal) {
      setTitle(deal.title);
      setValue(deal.value ? String(deal.value) : '');
      setNotes(deal.notes ?? '');
      setStageId(deal.stage_id);
      setPipelineId(deal.pipeline_id);
    } else {
      const p = pipelines.find((x) => x.id === newForContact?.pipelineId) ?? pipelines[0];
      setTitle('');
      setValue('');
      setNotes('');
      setPipelineId(p?.id ?? '');
      setStageId(p?.stages[0]?.id ?? '');
    }
  }, [visible, deal, pipelines, newForContact?.pipelineId]);

  const amount = Number(value.replace(/,/g, ''));
  const valid = title.trim().length > 0 && (value.trim() === '' || (Number.isFinite(amount) && amount >= 0));

  async function run(label: string, fn: () => Promise<void>, ok: string) {
    setBusy(label);
    try {
      await fn();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      notify(ok, 'success');
      onChanged();
      onClose();
    } catch (e) {
      notify(errText(e), 'error');
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    if (!valid) return notify('Add a title and a valid amount.', 'error');
    if (deal) {
      await run(
        'save',
        async () => {
          await updateDeal(deal.id, { title, value: amount || 0, notes });
          if (stageId !== deal.stage_id) await moveDeal(deal.id, stageId);
        },
        'Deal saved',
      );
    } else if (newForContact && accountId && session && pipeline && stageId) {
      await run(
        'save',
        () =>
          createDeal({
            accountId,
            userId: session.user.id,
            contactId: newForContact.id,
            pipelineId: pipeline.id,
            stageId,
            title,
            value: amount || 0,
            notes,
          }),
        'Deal created',
      );
    }
  }

  const status = (deal?.status ?? 'open') as DealStatus;
  const confirmDelete = () =>
    Alert.alert('Delete this deal?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deal && run('delete', () => deleteDeal(deal.id), 'Deal deleted') },
    ]);

  return (
    <Sheet visible={visible} onClose={onClose} title={deal ? 'Deal' : 'New deal'}>
      {deal?.contact ? (
        <Text muted>
          {deal.contact.name || fmtPhone(deal.contact.phone)} · {fmtMoney(deal.value, deal.currency)}
        </Text>
      ) : null}
      {deal ? (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Badge label={status === 'won' ? 'Won' : status === 'lost' ? 'Lost' : 'Open'} tone={status === 'won' ? 'success' : status === 'lost' ? 'danger' : 'info'} />
        </View>
      ) : null}
      <Input label="Title" value={title} onChangeText={setTitle} placeholder="e.g. Festive combo order" editable={canWrite} />
      <Input label="Value (₹)" value={value} onChangeText={setValue} keyboardType="decimal-pad" placeholder="0" editable={canWrite} />
      {pipeline ? (
        <View style={{ gap: 8 }}>
          <Text variant="label">Stage</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {pipeline.stages.map((s) => {
              const on = s.id === stageId;
              return (
                <Pressable
                  key={s.id}
                  disabled={!canWrite}
                  onPress={() => setStageId(s.id)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 999,
                    borderWidth: 1.5,
                    borderColor: on ? s.color : colors.border,
                    backgroundColor: on ? `${s.color}22` : 'transparent',
                  }}
                >
                  <Text variant="caption" color={on ? s.color : colors.text} style={{ fontWeight: '700' }}>
                    {s.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}
      <Input label="Notes" value={notes} onChangeText={setNotes} multiline style={{ minHeight: 70, textAlignVertical: 'top' }} editable={canWrite} />
      {canWrite ? (
        <>
          <Button title={deal ? 'Save changes' : 'Create deal'} onPress={save} loading={busy === 'save'} disabled={!valid} />
          {deal ? (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {status !== 'won' ? (
                <Button
                  style={{ flex: 1 }}
                  variant="secondary"
                  icon="trophy-outline"
                  title="Mark won"
                  loading={busy === 'won'}
                  onPress={() => run('won', () => setDealStatus(deal.id, 'won'), 'Marked as won')}
                />
              ) : null}
              {status !== 'lost' ? (
                <Button
                  style={{ flex: 1 }}
                  variant="secondary"
                  icon="close-circle-outline"
                  title="Mark lost"
                  loading={busy === 'lost'}
                  onPress={() => run('lost', () => setDealStatus(deal.id, 'lost'), 'Marked as lost')}
                />
              ) : null}
              {status !== 'open' ? (
                <Button
                  style={{ flex: 1 }}
                  variant="secondary"
                  icon="refresh-outline"
                  title="Reopen"
                  loading={busy === 'open'}
                  onPress={() => run('open', () => setDealStatus(deal.id, 'open'), 'Deal reopened')}
                />
              ) : null}
            </View>
          ) : null}
          {deal && isAdmin ? <Button title="Delete deal" variant="ghost" onPress={confirmDelete} /> : null}
        </>
      ) : (
        <Text variant="caption" muted>
          You have view-only access, so deals cannot be changed.
        </Text>
      )}
    </Sheet>
  );
}
