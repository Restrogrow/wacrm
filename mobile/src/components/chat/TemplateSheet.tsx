import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, View } from 'react-native';

import { BottomSheet, SheetRow } from '@/components/chat/BottomSheet';
import { TemplatePreview } from '@/components/chat/TemplatePreview';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { extractVariableIndices, renderTemplateBody } from '@/features/inbox/format';
import { fetchApprovedTemplates } from '@/features/inbox/queries';
import type { MessageTemplate } from '@/features/inbox/types';
import { useTheme } from '@/theme';

export interface TemplateValues {
  body: string[];
  headerText?: string;
  buttonParams?: Record<number, string>;
}

export function TemplateSheet({
  visible,
  onClose,
  contactName,
  onSend,
}: {
  visible: boolean;
  onClose: () => void;
  contactName: string | null;
  onSend: (template: MessageTemplate, values: TemplateValues, rendered: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const { colors } = useTheme();
  const [templates, setTemplates] = useState<MessageTemplate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<MessageTemplate | null>(null);
  const [params, setParams] = useState<string[]>([]);
  const [headerText, setHeaderText] = useState('');
  const [buttonParams, setButtonParams] = useState<Record<number, string>>({});
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setError(null);
    fetchApprovedTemplates()
      .then(setTemplates)
      .catch(() => setError('Could not load your templates. Check your connection.'));
  }, [visible]);

  const slots = useMemo(() => {
    if (!picked) return { body: [] as number[], header: 0, urls: [] as { index: number; text: string }[] };
    const urls: { index: number; text: string }[] = [];
    (picked.buttons ?? []).forEach((b, i) => {
      if (b.type === 'URL' && b.url && extractVariableIndices(b.url).length > 0) urls.push({ index: i, text: b.text });
    });
    return {
      body: extractVariableIndices(picked.body_text),
      header: picked.header_type === 'text' && picked.header_content ? extractVariableIndices(picked.header_content).length : 0,
      urls,
    };
  }, [picked]);

  function reset() {
    setPicked(null);
    setParams([]);
    setHeaderText('');
    setButtonParams({});
  }

  function choose(t: MessageTemplate) {
    setPicked(t);
    const first = contactName && !/^\+?[\d\s-]+$/.test(contactName) ? contactName.split(/\s+/)[0] : '';
    const count = extractVariableIndices(t.body_text).length;
    setParams(Array.from({ length: count }, (_, i) => (i === 0 ? first : '')));
  }

  const values: TemplateValues = {
    body: slots.body.map((_, i) => params[i] ?? ''),
    headerText: slots.header > 0 ? headerText : undefined,
    buttonParams: slots.urls.length > 0 ? buttonParams : undefined,
  };
  const missing = values.body.some((v) => !v.trim()) || (slots.header > 0 && !headerText.trim()) || slots.urls.some((u) => !(buttonParams[u.index] ?? '').trim());
  const rendered = picked ? renderTemplateBody(picked.body_text, values.body) : '';

  async function send() {
    if (!picked || sending) return;
    setSending(true);
    const res = await onSend(picked, values, rendered);
    setSending(false);
    if (res.ok) {
      reset();
      onClose();
    } else if (res.error) {
      Alert.alert('Template not sent', res.error);
    }
  }

  return (
    <BottomSheet
      visible={visible}
      onClose={() => {
        reset();
        onClose();
      }}
      title={picked ? picked.name.replace(/_/g, ' ') : 'Send a template'}
    >
      {picked ? (
        <View style={{ gap: 12 }}>
          <TemplatePreview template={picked} body={rendered} />
          {slots.header > 0 ? <Input label="Header value" value={headerText} onChangeText={setHeaderText} placeholder="Text for the header" /> : null}
          {slots.body.map((n, i) => (
            <Input key={n} label={`Value for {{${n}}}`} value={params[i] ?? ''} onChangeText={(v) => setParams((prev) => Object.assign([...prev], { [i]: v }))} placeholder={i === 0 ? 'e.g. the customer name' : 'Type a value'} />
          ))}
          {slots.urls.map((u) => (
            <Input key={u.index} label={`Link ending for "${u.text}"`} value={buttonParams[u.index] ?? ''} onChangeText={(v) => setButtonParams((prev) => ({ ...prev, [u.index]: v }))} autoCapitalize="none" />
          ))}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button title="Back" variant="secondary" onPress={reset} style={{ flex: 1 }} />
            <Button title="Send" onPress={send} loading={sending} disabled={missing} style={{ flex: 2 }} />
          </View>
        </View>
      ) : templates === null && !error ? (
        <ActivityIndicator color={colors.primary} style={{ padding: 24 }} />
      ) : error ? (
        <Text muted style={{ padding: 12 }}>
          {error}
        </Text>
      ) : templates && templates.length === 0 ? (
        <Text muted style={{ padding: 12 }}>
          You have no approved templates yet. Create one on the web under Templates, and Meta will review it.
        </Text>
      ) : (
        (templates ?? []).map((t) => <SheetRow key={t.id} icon="document-text-outline" label={t.name.replace(/_/g, ' ')} hint={t.body_text} onPress={() => choose(t)} />)
      )}
    </BottomSheet>
  );
}
