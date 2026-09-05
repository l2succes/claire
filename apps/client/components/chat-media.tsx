import { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, LayoutChangeEvent, Pressable, Text, View } from 'react-native';
import { Pause, Play, RotateCcw, SendHorizonal, Square, Trash2 } from 'lucide-react-native';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { colors, mobileType, radius, space } from '@claire/design-system';
import type { OutgoingMediaUpload } from '../services/platforms';

type PausablePlayer = { pause: () => void };
let activeAudioPlayer: PausablePlayer | null = null;

function formatDuration(seconds?: number) {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds || 0) : 0;
  const minutes = Math.floor(safe / 60);
  return `${minutes}:${Math.floor(safe % 60).toString().padStart(2, '0')}`;
}

export function ChatAudioPlayer({ uri, messageId }: { uri: string; messageId: string }) {
  const player = useAudioPlayer(uri, { updateInterval: 250, downloadFirst: false });
  const status = useAudioPlayerStatus(player);
  const [trackWidth, setTrackWidth] = useState(1);
  const duration = status.duration || 0;
  const progress = duration > 0 ? Math.min(1, status.currentTime / duration) : 0;

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') player.pause();
    });
    return () => {
      subscription.remove();
      player.pause();
      if (activeAudioPlayer === player) activeAudioPlayer = null;
    };
  }, [player]);

  const toggle = async () => {
    if (status.playing) {
      player.pause();
      return;
    }
    if (duration > 0 && status.currentTime >= duration - 0.1) await player.seekTo(0);
    if (activeAudioPlayer && activeAudioPlayer !== player) activeAudioPlayer.pause();
    activeAudioPlayer = player;
    player.play();
  };

  const seek = async (locationX: number) => {
    if (!duration) return;
    await player.seekTo(Math.max(0, Math.min(duration, (locationX / trackWidth) * duration)));
  };

  return (
    <View testID={`media-audio-${messageId}`} style={{ minWidth: 220, flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
      <Pressable accessibilityRole="button" accessibilityLabel={status.playing ? 'Pause audio' : 'Play audio'} onPress={() => void toggle()} style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.ink }}>
        {status.isBuffering ? <ActivityIndicator size="small" color={colors.lime} /> : status.playing ? <Pause size={15} color={colors.lime} /> : <Play size={15} color={colors.lime} fill={colors.lime} />}
      </Pressable>
      <View style={{ flex: 1, gap: 4 }}>
        <Pressable
          accessibilityRole="adjustable"
          accessibilityLabel="Audio progress"
          onLayout={(event: LayoutChangeEvent) => setTrackWidth(Math.max(1, event.nativeEvent.layout.width))}
          onPress={(event) => void seek(event.nativeEvent.locationX)}
          style={{ height: 18, justifyContent: 'center' }}
        >
          <View style={{ height: 4, borderRadius: 2, overflow: 'hidden', backgroundColor: colors.neutral[200] }}>
            <View style={{ width: `${progress * 100}%`, height: '100%', backgroundColor: colors.focus }} />
          </View>
        </Pressable>
        <Text style={{ ...mobileType.label, color: colors.neutral[600], fontVariant: ['tabular-nums'] }}>{formatDuration(status.currentTime)} / {formatDuration(duration)}</Text>
      </View>
      {!status.isLoaded ? <RotateCcw size={15} color={colors.neutral[400]} /> : null}
    </View>
  );
}

export function VoiceRecorderPanel({ onReady, onCancel }: { onReady: (media: OutgoingMediaUpload) => void; onCancel: () => void }) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder, 250);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<OutgoingMediaUpload | null>(null);

  const start = async () => {
    setError(null);
    const permission = await AudioModule.requestRecordingPermissionsAsync();
    if (!permission.granted) {
      setError('Microphone access is required to record a voice message.');
      return;
    }
    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
  };

  const stop = async () => {
    await recorder.stop();
    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
    if (!recorder.uri) {
      setError('The recording could not be saved.');
      return;
    }
    setPreview({
      uri: recorder.uri,
      fileName: `voice-${Date.now()}.m4a`,
      mimeType: 'audio/mp4',
      kind: 'voice',
      durationMs: state.durationMillis,
    });
  };

  useEffect(() => () => {
    if (state.isRecording) void recorder.stop();
  }, [recorder, state.isRecording]);

  return (
    <View testID="voice-recorder-panel" style={{ gap: space[2], padding: space[3], borderWidth: 1, borderColor: colors.ink, borderRadius: radius.control, backgroundColor: colors.sky }}>
      {preview ? <ChatAudioPlayer uri={preview.uri} messageId="voice-preview" /> : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
          <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: state.isRecording ? colors.danger : colors.neutral[400] }} />
          <Text style={{ ...mobileType.bodySmall, flex: 1, color: colors.ink, fontVariant: ['tabular-nums'] }}>{state.isRecording ? `Recording ${formatDuration((state.durationMillis || 0) / 1000)}` : 'Ready to record a voice message'}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={state.isRecording ? 'Stop recording' : 'Start recording'} onPress={() => void (state.isRecording ? stop() : start())} style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.ink }}>
            {state.isRecording ? <Square size={14} color={colors.lime} fill={colors.lime} /> : <View style={{ width: 13, height: 13, borderRadius: 7, backgroundColor: colors.danger }} />}
          </Pressable>
        </View>
      )}
      {error ? <Text selectable style={{ ...mobileType.bodySmall, color: colors.danger }}>{error}</Text> : null}
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: space[2] }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Discard voice message" onPress={onCancel} style={{ minHeight: 34, paddingHorizontal: space[3], flexDirection: 'row', alignItems: 'center', gap: 5 }}><Trash2 size={15} color={colors.neutral[600]} /><Text style={{ ...mobileType.label, color: colors.neutral[600] }}>Discard</Text></Pressable>
        {preview ? <Pressable accessibilityRole="button" accessibilityLabel="Use voice message" onPress={() => onReady(preview)} style={{ minHeight: 34, paddingHorizontal: space[3], borderRadius: radius.control, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.ink }}><SendHorizonal size={14} color={colors.lime} /><Text style={{ ...mobileType.label, color: colors.lime }}>Use recording</Text></Pressable> : null}
      </View>
    </View>
  );
}
