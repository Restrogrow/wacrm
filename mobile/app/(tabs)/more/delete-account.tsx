import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { Alert, View } from 'react-native';

import { FormError } from '@/components/auth/AuthShell';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Card, ErrorView, LoadingView } from '@/components/ui/misc';
import { SUPPORT_EMAIL } from '@/config';
import { ScreenHeader } from '@/features/settings/ScreenHeader';
import { api, ApiError } from '@/lib/api';
import { useTheme } from '@/theme';

// Mirrors GET/POST/DELETE /api/account/delete. Deleting is a request: the Repeat Grow
// team reviews it and emails the person. Nothing is removed until then.
interface DeleteInfo {
  is_owner: boolean;
  account_name: string | null;
  other_members: number;
  can_delete: boolean;
  available: boolean;
  confirm_with: string | null;
  pending_request: { id: string; requested_at: string; reason: string | null } | null;
}

export default function DeleteAccount() {
  const { colors } = useTheme();
  const [info, setInfo] = useState<DeleteInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [justSent, setJustSent] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setInfo(await api<DeleteInfo>('/api/account/delete'));
    } catch (e) {
      setLoadError(e instanceof ApiError ? e.message : 'Could not load your account details.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async () => {
    if (!info) return;
    setError(null);
    setBusy(true);
    try {
      const res = await api<{ pending_request: DeleteInfo['pending_request'] }>('/api/account/delete', {
        method: 'POST',
        body: { confirm: typed.trim(), reason: reason.trim() || undefined },
      });
      setInfo({ ...info, pending_request: res.pending_request });
      setJustSent(true);
      setTyped('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not send your request.');
    }
    setBusy(false);
  };

  const cancelRequest = () =>
    Alert.alert('Cancel deletion request?', 'Your account will stay as it is.', [
      { text: 'Keep the request', style: 'cancel' },
      {
        text: 'Cancel request',
        onPress: async () => {
          setBusy(true);
          try {
            await api('/api/account/delete', { method: 'DELETE' });
            setInfo((p) => (p ? { ...p, pending_request: null } : p));
            setJustSent(false);
          } catch (e) {
            setError(e instanceof ApiError ? e.message : 'Could not cancel the request.');
          }
          setBusy(false);
        },
      },
    ]);

  if (!info && !loadError) {
    return (
      <View style={{ flex: 1 }}>
        <ScreenHeader title="Delete account" />
        <LoadingView />
      </View>
    );
  }
  if (!info) {
    return (
      <View style={{ flex: 1 }}>
        <ScreenHeader title="Delete account" />
        <ErrorView message={loadError ?? 'Something went wrong.'} onRetry={load} />
      </View>
    );
  }

  const expected = (info.confirm_with ?? '').trim().toLowerCase();
  const matches = !!expected && typed.trim().toLowerCase() === expected;
  const pending = info.pending_request;

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader title="Delete account" />
      <Screen scroll edges={[]} style={{ paddingTop: 8, gap: 16, paddingBottom: 40 }}>
        <Card style={{ gap: 10, backgroundColor: colors.dangerSoft, borderColor: colors.danger }}>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <Ionicons name="warning" size={22} color={colors.danger} />
            <Text variant="heading" color={colors.danger}>
              {info.is_owner ? 'Delete your account and business' : 'Delete your account'}
            </Text>
          </View>
          <Text variant="caption" color={colors.danger}>
            {info.is_owner
              ? `This permanently deletes ${info.account_name ?? 'your business'} and everything in it: contacts, chats and messages, templates, automations and settings. It cannot be undone.`
              : 'This deletes your login and personal details. The business keeps its contacts and chats. It cannot be undone.'}
          </Text>
        </Card>

        {pending ? (
          <Card style={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
              <Ionicons name="time-outline" size={22} color={colors.warning} />
              <Text variant="heading">{justSent ? 'Request sent' : 'Deletion requested'}</Text>
            </View>
            <Text muted>
              Requested on{' '}
              {new Date(pending.requested_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}. Our team will review it and email you. Nothing is deleted until then.
            </Text>
            <FormError message={error} />
            <Button title="Cancel request" variant="secondary" onPress={cancelRequest} loading={busy} />
          </Card>
        ) : !info.available ? (
          <Card>
            <Text muted>Account deletion is not set up yet. Please email {SUPPORT_EMAIL} from your account email.</Text>
          </Card>
        ) : !info.can_delete ? (
          <Card>
            <Text muted>
              {`You still have ${info.other_members} teammate${info.other_members === 1 ? '' : 's'} on this account. Remove them or transfer ownership in the web dashboard (Settings, Team members), then come back here.`}
            </Text>
          </Card>
        ) : (
          <Card style={{ gap: 14 }}>
            <Text>
              To confirm, type your email address <Text color={colors.text} style={{ fontWeight: '700' }}>{info.confirm_with}</Text> below.
            </Text>
            <FormError message={error} />
            <Input label="Your email" value={typed} onChangeText={setTyped} autoCapitalize="none" keyboardType="email-address" placeholder={info.confirm_with ?? 'you@company.com'} />
            <Input label="Why are you leaving? (optional)" value={reason} onChangeText={setReason} multiline placeholder="Tell us how we could improve" style={{ minHeight: 70, textAlignVertical: 'top' }} />
            <Text variant="caption" muted>
              This sends a request. Our team approves it and emails you before anything is deleted.
            </Text>
            <Button title="Request deletion" variant="danger" onPress={submit} loading={busy} disabled={!matches} />
          </Card>
        )}
      </Screen>
    </View>
  );
}
