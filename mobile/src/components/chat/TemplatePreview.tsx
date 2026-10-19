import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';

import { Text } from '@/components/ui/Text';
import type { MessageTemplate } from '@/features/inbox/types';
import { useTheme } from '@/theme';

type IconName = keyof typeof Ionicons.glyphMap;

const BUTTON_ICON: Record<string, IconName> = {
  URL: 'open-outline',
  PHONE_NUMBER: 'call-outline',
  VOICE_CALL: 'logo-whatsapp',
  COPY_CODE: 'copy-outline',
  QUICK_REPLY: 'arrow-undo-outline',
};

/** WhatsApp-style bubble for a template: header, body, footer and its buttons. */
export function TemplatePreview({ template, body }: { template: MessageTemplate; body: string }) {
  const { colors } = useTheme();
  const buttons = template.buttons ?? [];
  return (
    <View style={{ backgroundColor: colors.bubbleOut, borderRadius: 14, overflow: 'hidden' }}>
      <View style={{ padding: 12, gap: 6 }}>
        {template.header_type === 'text' && template.header_content ? <Text style={{ fontWeight: '700' }}>{template.header_content}</Text> : null}
        {template.header_type && template.header_type !== 'text' ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name={template.header_type === 'image' ? 'image-outline' : template.header_type === 'video' ? 'videocam-outline' : 'document-outline'} size={16} color={colors.textMuted} />
            <Text variant="caption" muted>
              {template.header_type === 'image' ? 'Photo' : template.header_type === 'video' ? 'Video' : 'Document'} from the template
            </Text>
          </View>
        ) : null}
        <Text>{body}</Text>
        {template.footer_text ? (
          <Text variant="caption" muted>
            {template.footer_text}
          </Text>
        ) : null}
      </View>
      {buttons.map((b, i) => (
        <View
          key={i}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.08)' }}
        >
          <Ionicons name={BUTTON_ICON[b.type?.toUpperCase()] ?? 'ellipse-outline'} size={16} color={colors.info} />
          <Text variant="label" color={colors.info}>
            {b.text}
          </Text>
        </View>
      ))}
    </View>
  );
}
