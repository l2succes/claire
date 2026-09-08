import { useMemo, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { ExternalLink, Link2 } from 'lucide-react-native';
import { colors, mobileType, radius, space } from '@claire/design-system';

const TRAILING_PUNCTUATION = /[),.!?;:'"]+$/;
const URL_PATTERN = /https?:\/\/[^\s<>]+/gi;

export interface MessageLink {
  url: string;
  host: string;
  label: string;
}

function linkLabel(host: string): string {
  const normalized = host.replace(/^www\./, '');
  if (normalized === 'maps.app.goo.gl' || normalized.endsWith('.google.com')) return 'Google Maps';
  if (normalized === 'youtu.be' || normalized.endsWith('.youtube.com')) return 'YouTube';
  return normalized;
}

export function extractMessageLinks(text: string): MessageLink[] {
  const seen = new Set<string>();
  return (text.match(URL_PATTERN) || []).flatMap((match) => {
    const url = match.replace(TRAILING_PUNCTUATION, '');
    if (seen.has(url)) return [];
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return [];
      seen.add(url);
      return [{ url, host: parsed.hostname, label: linkLabel(parsed.hostname) }];
    } catch {
      return [];
    }
  });
}

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
