import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { FeedbackPressable } from '../../components/mobile/pressable-feedback';

export function MediaImage({ uri, onDimensions, testID, onRetry, contentFit = 'contain' }: {
  uri: string;
  testID: string;
  onDimensions?: (width: number, height: number) => void;
  onRetry?: () => void;
  contentFit?: 'contain' | 'cover';
}) {
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  useEffect(() => {
    setStatus('loading');
    const timeout = setTimeout(() => setStatus((current) => current === 'loading' ? 'error' : current), 30_000);
    return () => clearTimeout(timeout);
  }, [uri, attempt]);
  return (
    <View style={{ flex: 1 }} testID={testID}>
      <Image
        key={`${uri}:${attempt}`}
        source={{ uri }}
        style={{ width: '100%', height: '100%' }}
        contentFit={contentFit}
        cachePolicy="memory-disk"
        testID={`${testID}-image`}
        onLoad={({ source }) => { setStatus('ready'); onDimensions?.(source.width, source.height); }}
        onError={() => setStatus('error')}
        accessibilityLabel="Message attachment"
      />
      {status !== 'ready' && (
        <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: '#252525' }}>
          {status === 'loading' ? <ActivityIndicator color="white" accessibilityLabel="Loading image" /> : (
            <FeedbackPressable
              accessibilityRole="button"
              accessibilityLabel="Retry image"
              onPress={(event) => { event.stopPropagation(); setAttempt((value) => value + 1); onRetry?.(); }}
              style={{ padding: 16, minHeight: 44, justifyContent: 'center' }}
            >
              <Text style={{ color: 'white', textAlign: 'center' }}>Couldn’t load image. Tap to retry.</Text>
            </FeedbackPressable>
          )}
        </View>
      )}
    </View>
  );
}
