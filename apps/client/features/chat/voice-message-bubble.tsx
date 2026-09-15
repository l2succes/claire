import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { AlertCircle, Pause, Play, RotateCcw } from 'lucide-react-native';
import { colors, mobileType, space } from '@claire/design-system';
import { formatAudioDuration, sanitizeWaveform } from '@claire/chat-core';
import { VoiceWaveform } from '../../components/mobile/voice-waveform';
import { expoAudioModule, type ExpoAudioModule } from '../../components/claire/expo-audio-module';

export function VoiceMessageBubble({
  uri,
  messageId,
  durationMs,
  waveform,
  active,
  onActivate,
  onDeactivate,
}: {
  uri: string;
  messageId: string;
  durationMs?: number;
  waveform?: number[];
  active: boolean;
  onActivate: () => void;
  onDeactivate: () => void;
}) {
  const [retryKey, setRetryKey] = useState(0);
  const fallbackDuration = Math.max(0, (durationMs || 0) / 1000);
  const [loadedDuration, setLoadedDuration] = useState(fallbackDuration);

  if (!expoAudioModule) {
    return <VoiceUnavailable label="Update Claire to play voice notes" messageId={messageId} />;
  }
  if (!uri) return <VoiceUnavailable label="Voice note unavailable" messageId={messageId} />;

  if (!active) {
    return (
      <VoicePlayerShell
        messageId={messageId}
        playing={false}
        loading={false}
        duration={loadedDuration || fallbackDuration}
        currentTime={0}
        waveform={waveform}
        onToggle={onActivate}
      />
    );
  }

  return (
    <VoiceMessagePlayer
      key={retryKey}
      audio={expoAudioModule}
      uri={uri}
      messageId={messageId}
      fallbackDuration={fallbackDuration}
      waveform={waveform}
      onFinished={onDeactivate}
      onDurationKnown={setLoadedDuration}
      onRetry={() => setRetryKey((value) => value + 1)}
    />
  );
}

function VoiceMessagePlayer({
  audio,
  uri,
  messageId,
  fallbackDuration,
  waveform,
  onFinished,
  onDurationKnown,
  onRetry,
}: {
  audio: ExpoAudioModule;
  uri: string;
  messageId: string;
  fallbackDuration: number;
  waveform?: number[];
  onFinished: () => void;
  onDurationKnown: (duration: number) => void;
  onRetry: () => void;
}) {
  const player = audio.useAudioPlayer(uri, { downloadFirst: true, updateInterval: 100 });
  const status = audio.useAudioPlayerStatus(player);
  const [audioSessionReady, setAudioSessionReady] = useState(false);
  const initialPlayStarted = useRef(false);

  useEffect(() => {
    void audio
      .setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false })
      .then(() => setAudioSessionReady(true));
  }, [audio]);

  useEffect(() => {
    // `downloadFirst` creates an initially empty player. That empty player can
    // report `isLoaded=true`; wait for the downloaded replacement to expose a
    // real duration before consuming the one-shot autoplay request.
    if (
      !audioSessionReady ||
      !status.isLoaded ||
      status.duration <= 0 ||
      initialPlayStarted.current
    ) return;
    initialPlayStarted.current = true;
    player.play();
  }, [audioSessionReady, player, status.duration, status.isLoaded]);

  useEffect(() => {
    if (!status.didJustFinish) return;
    void player.seekTo(0).finally(onFinished);
  }, [onFinished, player, status.didJustFinish]);

  useEffect(() => {
    if (status.duration > 0) onDurationKnown(status.duration);
  }, [onDurationKnown, status.duration]);

  if (status.playbackState === 'failed') {
    return (
      <View testID={`media-audio-error-${messageId}`} style={{ width: 250, gap: 7 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
          <AlertCircle size={17} color={colors.danger} />
          <Text selectable style={{ ...mobileType.label, color: colors.danger, flex: 1 }}>
            Couldn’t play this voice note
          </Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Retry voice note" onPress={onRetry} style={CONTROL_STYLE}>
            <RotateCcw size={15} color={colors.ink} />
          </Pressable>
        </View>
      </View>
    );
  }

  const duration = status.duration || fallbackDuration;
  return (
    <VoicePlayerShell
      messageId={messageId}
      playing={status.playing}
      loading={!status.isLoaded || status.isBuffering || status.duration <= 0}
      duration={duration}
      currentTime={status.currentTime}
      waveform={waveform}
      onToggle={() => {
        if (status.playing) player.pause();
        else player.play();
      }}
      onSeek={(progress) => void player.seekTo(progress * duration)}
    />
  );
}

function VoicePlayerShell({
  messageId,
  playing,
  loading,
  duration,
  currentTime,
  waveform,
  onToggle,
  onSeek,
}: {
  messageId: string;
  playing: boolean;
  loading: boolean;
  duration: number;
  currentTime: number;
  waveform?: number[];
  onToggle: () => void;
  onSeek?: (progress: number) => void;
}) {
  const progress = duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0;
  const safeWaveform = sanitizeWaveform(waveform);
  return (
    <View
      testID={`media-audio-${messageId}`}
      style={{ width: 250, minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: space[2] }}
    >
      <Pressable
        testID={`media-audio-play-${messageId}`}
        accessibilityRole="button"
        accessibilityLabel={playing ? 'Pause voice message' : 'Play voice message'}
        onPress={onToggle}
        style={[CONTROL_STYLE, { backgroundColor: colors.lime }]}
      >
        {loading ? (
          <ActivityIndicator size="small" color={colors.ink} />
        ) : playing ? (
          <Pause size={16} color={colors.ink} fill={colors.ink} />
        ) : (
          <Play size={16} color={colors.ink} fill={colors.ink} />
        )}
      </Pressable>
      <View style={{ flex: 1, minWidth: 0 }}>
        <VoiceWaveform
          samples={safeWaveform}
          progress={progress}
          playedColor={colors.ink}
          remainingColor={colors.neutral[400]}
          onSeek={onSeek}
          accessibilityLabel={`Voice note waveform, ${Math.round(progress * 100)} percent played`}
        />
        <Text
          selectable
          style={{ ...mobileType.label, color: colors.neutral[600], fontVariant: ['tabular-nums'], marginTop: 1 }}
        >
          {formatAudioDuration(currentTime > 0 ? currentTime : duration)}
        </Text>
      </View>
    </View>
  );
}

function VoiceUnavailable({ label, messageId }: { label: string; messageId: string }) {
  return (
    <View testID={`media-audio-${messageId}`} style={{ width: 250, minHeight: 44, justifyContent: 'center' }}>
      <Text selectable style={{ ...mobileType.label, color: colors.neutral[400] }}>{label}</Text>
    </View>
  );
}

const CONTROL_STYLE = {
  width: 36,
  height: 36,
  borderRadius: 18,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  backgroundColor: colors.neutral[100],
};
