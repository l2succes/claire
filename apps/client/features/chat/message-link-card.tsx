import { useMemo, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { ExternalLink, Link2 } from 'lucide-react-native';
import { colors, mobileType, radius, space } from '@claire/design-system';

import { extractMessageLinks } from './message-links';

export { extractMessageLinks } from './message-links';
export type { MessageLink } from './message-links';

export function MessageTextWithLinks({ text, fromMe }: { text: string; fromMe: boolean }) {
  const links = useMemo(() => extractMessageLinks(text), [text]);
  const [pressedUrl, setPressedUrl] = useState<string | null>(null);

  if (!links.length) {
    return <Text style={{ ...mobileType.body, color: colors.ink }}>{text}</Text>;
  }

  return (
    <View style={{ gap: space[2] }}>
      <Text selectable style={{ ...mobileType.body, color: colors.ink }}>{text}</Text>
      {links.map((link) => (
        <Pressable
          key={link.url}
          testID="message-link-preview"
          accessibilityRole="link"
          accessibilityLabel={`Open ${link.label}`}
          onPress={() => void Linking.openURL(link.url).catch(() => undefined)}
          onPressIn={() => setPressedUrl(link.url)}
          onPressOut={() => setPressedUrl(null)}
          style={{
            minWidth: 220,
            maxWidth: 300,
            flexDirection: 'row',
            alignItems: 'center',
            gap: space[2],
            padding: space[3],
            borderRadius: radius.control,
            borderWidth: 1,
            borderColor: colors.neutral[300],
            backgroundColor: fromMe ? 'rgba(255,255,255,0.58)' : colors.cream,
            opacity: pressedUrl === link.url ? 0.68 : 1,
          }}
        >
          <View style={{ width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paper }}>
            <Link2 size={17} color={colors.ink} />
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text numberOfLines={1} style={{ ...mobileType.label, fontWeight: '800', color: colors.ink }}>{link.label}</Text>
            <Text numberOfLines={1} style={{ ...mobileType.label, color: colors.neutral[600] }}>{link.host.replace(/^www\./, '')}</Text>
          </View>
          <ExternalLink size={16} color={colors.neutral[600]} />
        </Pressable>
      ))}
    </View>
  );
}
