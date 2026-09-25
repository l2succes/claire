import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { visualMediaForMessage, type ChatMessage } from '@claire/chat-core';
import { colors } from '@claire/design-system';
import { MediaMessage } from '../media-message';
import { MediaViewer } from '../media-viewer';

const fixtureBase = 'http://127.0.0.1:3311';
const fixtures: ChatMessage[] = [
  { id: 'landscape', content: '', timestamp: '2026-09-24T10:00:00Z', from_me: false, contact_name: 'Synthetic image', content_type: 'image', media_url: `${fixtureBase}/media/fixture/landscape.png`, metadata: { mediaInfo: { w: 640, h: 400 } } },
  { id: 'portrait', content: 'Portrait attachment', timestamp: '2026-09-24T10:00:00Z', from_me: true, content_type: 'image', media_url: `${fixtureBase}/media/fixture/portrait.png`, metadata: { mediaInfo: { w: 300, h: 600 } } },
  { id: 'video', content: '', timestamp: '2026-09-24T10:00:00Z', from_me: false, content_type: 'video', media_url: `${fixtureBase}/media/fixture/video.mp4`, metadata: { mediaInfo: { w: 640, h: 360, duration: 12000 } } },
];

/** Development-only fixtures: no account mutation or bridged messages. */
export function MediaPreviewScreen() {
  const { show, fixture } = useLocalSearchParams<{ show?: string; fixture?: string }>();
  const [selected, setSelected] = useState<ChatMessage | null>(() => fixtures.find((item) => item.id === show) || null);
  const [width, setWidth] = useState(320);
  if (!__DEV__ || fixture !== '1') return null;
  const selectedMedia = selected ? visualMediaForMessage(selected, fixtureBase) : null;
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.cream }} onLayout={({ nativeEvent }) => setWidth(nativeEvent.layout.width)}>
    <Text style={{ fontSize: 20, margin: 16 }}>Media verification · synthetic fixtures</Text>
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
      {fixtures.map((message) => <View key={message.id} style={{ alignItems: message.from_me ? 'flex-end' : 'flex-start' }}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Open ${message.id}`} onPress={() => setSelected(message)}>
          <MediaMessage media={visualMediaForMessage(message, fixtureBase)!} message={message} maxWidth={Math.min((width - 32) * 0.78, 360)} sender={message.contact_name} />
        </Pressable>
      </View>)}
    </ScrollView>
    {selected && selectedMedia ? <MediaViewer key={selected.id} message={selected} media={selectedMedia} onClose={() => setSelected(null)} /> : null}
  </SafeAreaView>;
}
