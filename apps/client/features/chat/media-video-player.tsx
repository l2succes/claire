import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Text, View } from 'react-native';
import type { VideoPlayerStatus } from 'expo-video';
import { expoVideoModule } from './expo-video-module';
import { FeedbackPressable } from '../../components/mobile/pressable-feedback';

export function MediaVideoPlayer({ uri }: { uri: string }) {
  const [attempt, setAttempt] = useState(0);
  if (!expoVideoModule) return <Text style={{ color: 'white', textAlign: 'center' }}>Update Claire to play this video.</Text>;
  return <ActiveVideo key={`${uri}:${attempt}`} uri={uri} onRetry={() => setAttempt((value) => value + 1)} />;
}

function ActiveVideo({ uri, onRetry }: { uri: string; onRetry: () => void }) {
  const video = expoVideoModule!;
  const player = video.useVideoPlayer(null, (instance) => {
    instance.loop = false;
    instance.audioMixingMode = 'doNotMix';
    instance.staysActiveInBackground = false;
  });
  const [status, setStatus] = useState<VideoPlayerStatus>('loading');
  const [timedOut, setTimedOut] = useState(false);
  const mayAutoplay = useRef(AppState.currentState === 'active');
  useEffect(() => {
    let active = true;
    const subscription = player.addListener('statusChange', ({ status: next }) => {
      if (active) setStatus(next);
    });
    const appState = AppState.addEventListener('change', (next) => {
      if (next !== 'active') { mayAutoplay.current = false; player.pause(); }
    });
    void player.replaceAsync({ uri }).then(() => {
      if (active && mayAutoplay.current) player.play();
    }).catch(() => { if (active) setStatus('error'); });
    return () => {
      active = false; subscription.remove(); appState.remove();
      // Native useVideoPlayer releases automatically; the web implementation
      // can retain a detached <video>, which must stop before it is collected.
      try { player.pause(); } catch { /* Native player already released. */ }
    };
  }, [player, uri]);
  useEffect(() => {
    if (status !== 'loading' && status !== 'idle') return;
    const timeout = setTimeout(() => { mayAutoplay.current = false; player.pause(); setTimedOut(true); }, 30_000);
    return () => clearTimeout(timeout);
  }, [status, player]);
  const failed = status === 'error' || timedOut;
  const VideoView = video.VideoView;
  return (
    <View style={{ flex: 1, width: '100%' }}>
      <VideoView player={player} nativeControls contentFit="contain" playsInline fullscreenOptions={{ enable: false }} allowsPictureInPicture={false} style={{ flex: 1 }} testID="media-viewer-video" />
      {(failed || status === 'loading' || status === 'idle') && (
        <View pointerEvents={failed ? 'auto' : 'none'} style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: failed ? '#111' : 'transparent', gap: 12 }}>
          {failed ? <>
            <Text selectable style={{ color: 'white', textAlign: 'center' }}>{timedOut ? 'This video is taking too long to load.' : 'Couldn’t play this video.'}</Text>
            <FeedbackPressable accessibilityRole="button" accessibilityLabel="Retry video" onPress={onRetry} style={{ minHeight: 44, padding: 12, borderRadius: 12, backgroundColor: '#333' }}><Text style={{ color: 'white' }}>Try again</Text></FeedbackPressable>
          </> : <ActivityIndicator color="white" accessibilityLabel="Loading video" />}
        </View>
      )}
    </View>
  );
}
