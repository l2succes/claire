import { useEffect } from 'react';
import { Modal, Platform, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { StatusBar } from 'expo-status-bar';
import type { ChatMessage, VisualMedia } from '@claire/chat-core';
import { host } from '@claire/host';
import { FeedbackPressable } from '../../components/mobile/pressable-feedback';
import { MediaVideoPlayer } from './media-video-player';
import { MediaZoomImage } from './media-zoom-image';

export function MediaViewer({ media, message, onClose }: { media: VisualMedia; message: ChatMessage; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const previous = document.activeElement as HTMLElement | null;
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); }
    };
    document.addEventListener('keydown', keydown, true);
    return () => {
      document.removeEventListener('keydown', keydown, true);
      previous?.focus();
    };
  }, [onClose]);
  return (
    <Modal visible animationType="fade" presentationStyle="fullScreen" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: 'black' }}>
        <StatusBar style="light" />
        <View testID="media-viewer" accessibilityViewIsModal onAccessibilityEscape={onClose} style={{ flex: 1, paddingTop: Math.max(insets.top, host.capabilities.nativeWindow ? 52 : 0), paddingBottom: insets.bottom }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 8 }}>
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={{ color: 'white', fontSize: 16, fontWeight: '600' }}>{message.from_me ? 'You' : message.contact_name || 'Attachment'}</Text>
              <Text style={{ color: '#aaa', fontSize: 12 }}>{new Date(message.timestamp).toLocaleString()}</Text>
            </View>
            <FeedbackPressable accessibilityRole="button" accessibilityLabel="Close media viewer" onPress={onClose} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: '#252525' }}><X color="white" size={24} /></FeedbackPressable>
          </View>
          {media.kind === 'video' ? <MediaVideoPlayer key={media.uri} uri={media.uri} /> : <MediaZoomImage key={media.uri} media={media} onClose={onClose} />}
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}
