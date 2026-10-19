import { useState, type ReactNode } from 'react';
import { Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Play } from 'lucide-react-native';
import { colors, mobileType, radius } from '@claire/design-system';
import { fitMediaSize, formatAudioDuration, parseMediaCaption, type ChatMessage, type VisualMedia } from '@claire/chat-core';
import { MediaImage } from './media-image';
import { useMediaDimensions } from '../../hooks/useMediaDimensions';

export function MediaMessage({ media, message, maxWidth, sender, reply }: {
  media: VisualMedia;
  message: ChatMessage;
  maxWidth: number;
  sender?: string;
  reply?: ReactNode;
}) {
  const dimensions = useMediaDimensions(media);
  const [posterFailed, setPosterFailed] = useState(false);
  const size = fitMediaSize(dimensions.width, dimensions.height, maxWidth, 420);
  const caption = parseMediaCaption(message.content);
  const hasCaption = Boolean(caption.text || caption.hint);
  const timestamp = `${message.edited_at ? 'Edited · ' : ''}${new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  return (
    <View testID={`media-message-${message.id}`} style={{ width: size.width, gap: 4 }}>
      {sender ? <Text style={{ ...mobileType.label, color: colors.neutral[600] }}>{sender}</Text> : null}
      {reply}
      {caption.badge ? <Text style={{ ...mobileType.label, color: colors.neutral[600] }}>{caption.badge}</Text> : null}
      <View testID={`media-preview-${message.id}`} style={{ ...size, borderRadius: radius.control, overflow: 'hidden', backgroundColor: '#252525' }}>
        {media.kind === 'image' ? (
          <MediaImage uri={media.uri} testID={`media-image-${message.id}`} onDimensions={dimensions.onDimensions} />
        ) : (
          <>
            {media.thumbnailUri && !posterFailed ? <Image source={{ uri: media.thumbnailUri }} contentFit="contain" style={{ width: '100%', height: '100%' }} onError={() => setPosterFailed(true)} /> : null}
            <View pointerEvents="none" style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
              <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center' }}>
                <Play size={24} color="white" fill="white" />
              </View>
            </View>
            {media.durationMs ? <Text style={{ position: 'absolute', top: 8, left: 8, color: 'white', backgroundColor: 'rgba(0,0,0,0.65)', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6 }}>{formatAudioDuration(media.durationMs / 1000)}</Text> : null}
          </>
        )}
        {!hasCaption ? <Text testID={`media-time-${message.id}`} style={{ position: 'absolute', bottom: 6, right: 6, color: 'white', backgroundColor: 'rgba(0,0,0,0.65)', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6, fontSize: 10 }}>{timestamp}</Text> : null}
      </View>
      {caption.text ? <Text style={{ ...mobileType.body, color: colors.ink }}>{caption.text}</Text> : null}
      {caption.hint ? <Text style={{ ...mobileType.label, color: colors.neutral[600], fontStyle: 'italic' }}>{caption.hint}</Text> : null}
      {hasCaption ? <Text style={{ ...mobileType.label, fontSize: 10, color: colors.neutral[600], textAlign: message.from_me ? 'right' : 'left' }}>{timestamp}</Text> : null}
    </View>
  );
}
