import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';
import { Mic, Pause, Play, SendHorizonal, Trash2 } from 'lucide-react-native';
import { File } from 'expo-file-system';
import { colors, mobileType } from '@claire/design-system';
import {
  downsampleWaveform,
  formatAudioDuration,
  meteringToWaveformSample,
} from '@claire/chat-core';
import { VoiceWaveform } from '../mobile/voice-waveform';
import { expoAudioModule, type ExpoAudioModule } from './expo-audio-module';

export type VoiceNoteDraft = {
  uri: string;
  durationMs: number;
  waveform: number[];
  mimeType: 'audio/mp4';
};

type VoiceNoteControlProps = {
  enabled: boolean;
  sending?: boolean;
  onSend: (draft: VoiceNoteDraft) => Promise<void>;
  children: (controls: { trigger: ReactNode; review: ReactNode }) => ReactNode;
};

function removeLocalRecording(uri?: string | null) {
  if (!uri) return;
  try {
    new File(uri).delete();
  } catch {
    // The OS can already have cleared a cache file; discard remains successful.
  }
}

function VoiceNoteReview({
  audio,
  draft,
  sending,
  onDiscard,
  onSend,
}: {
  audio: ExpoAudioModule;
  draft: VoiceNoteDraft;
  sending: boolean;
  onDiscard: () => void;
  onSend: () => void;
}) {
  const player = audio.useAudioPlayer(draft.uri);
  const status = audio.useAudioPlayerStatus(player);
  const playing = status.playing;
  const duration = status.duration || draft.durationMs / 1000;
  const progress = duration > 0 ? status.currentTime / duration : 0;

  useEffect(() => {
    if (status.didJustFinish) void player.seekTo(0);
  }, [player, status.didJustFinish]);

  return (
    <View
      testID="voice-note-review"
      style={{
        minHeight: 46,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 7,
        paddingHorizontal: 8,
        borderWidth: 1,
        borderColor: colors.neutral[200],
        borderRadius: 15,
        backgroundColor: colors.paper,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={playing ? 'Pause recorded voice note' : 'Play recorded voice note'}
        onPress={() => {
          if (playing) player.pause();
          else {
            void audio
              .setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false })
              .then(() => player.play());
          }
        }}
        style={roundControlStyle}
      >
        {playing ? <Pause size={16} color={colors.ink} fill={colors.ink} /> : <Play size={16} color={colors.ink} fill={colors.ink} />}
      </Pressable>
      <View accessibilityLabel={`Recorded voice note, ${formatAudioDuration(duration)}`} style={{ flex: 1, minWidth: 0 }}>
        <VoiceWaveform
          samples={draft.waveform}
          progress={progress}
          playedColor={colors.ink}
          remainingColor={colors.neutral[400]}
          onSeek={(nextProgress) => void player.seekTo(nextProgress * duration)}
          style={{ minHeight: 24 }}
        />
        <Text selectable style={{ ...mobileType.label, color: colors.neutral[600], marginTop: 1, fontVariant: ['tabular-nums'] }}>
          {formatAudioDuration(status.currentTime > 0 ? status.currentTime : duration)} · Voice note
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Discard voice note"
        disabled={sending}
        onPress={onDiscard}
        style={roundControlStyle}
      >
        <Trash2 size={16} color={colors.danger} strokeWidth={2.2} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Send voice note"
        disabled={sending}
        onPress={onSend}
        testID="voice-note-send"
        style={[roundControlStyle, { backgroundColor: colors.ink, opacity: sending ? 0.55 : 1 }]}
      >
        {sending ? <ActivityIndicator size="small" color={colors.lime} /> : <SendHorizonal size={16} color={colors.lime} strokeWidth={2.3} />}
      </Pressable>
    </View>
  );
}

/**
 * A hold-to-record control that fits in the existing composer. The recording
 * remains local until the review chip's Send action is explicitly chosen.
 */
export function VoiceNoteControl({
  enabled,
  sending = false,
  onSend,
  children,
}: VoiceNoteControlProps) {
  if (!expoAudioModule) return <>{children({ trigger: null, review: null })}</>;
  return (
    <VoiceNoteControlNative
      audio={expoAudioModule}
      enabled={enabled}
      sending={sending}
      onSend={onSend}
    >
      {children}
    </VoiceNoteControlNative>
  );
}

function VoiceNoteControlNative({
  audio,
  enabled,
  sending = false,
  onSend,
  children,
}: VoiceNoteControlProps & { audio: ExpoAudioModule }) {
  const recordingOptions = useMemo(
    () => ({
      ...audio.RecordingPresets.HIGH_QUALITY,
      numberOfChannels: 1,
      bitRate: 64_000,
      isMeteringEnabled: true,
    }),
    [audio],
  );
  const recorder = audio.useAudioRecorder(recordingOptions);
  const recorderState = audio.useAudioRecorderState(recorder, 100);
  const [draft, setDraft] = useState<VoiceNoteDraft | null>(null);
  const [arming, setArming] = useState(false);
  const [triggerPressed, setTriggerPressed] = useState(false);
  const [liveWaveform, setLiveWaveform] = useState<number[]>([]);
  const releaseRequested = useRef(false);
  const recordingStarted = useRef(false);
  const waveformRef = useRef<number[]>([]);
  const durationMsRef = useRef(0);
  const draftUriRef = useRef<string | null>(null);

  useEffect(() => {
    durationMsRef.current = Math.max(durationMsRef.current, recorderState.durationMillis);
    if (!recorderState.isRecording) return;
    const next = [...waveformRef.current, meteringToWaveformSample(recorderState.metering)];
    waveformRef.current = next;
    setLiveWaveform(downsampleWaveform(next, 48));
  }, [recorderState.durationMillis, recorderState.isRecording, recorderState.metering]);

  const stop = async () => {
    releaseRequested.current = true;
    if (!recordingStarted.current) return;
    recordingStarted.current = false;
    durationMsRef.current = Math.max(durationMsRef.current, recorderState.durationMillis);
    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) return;
      const durationMs = Math.max(
        1_000,
        Math.round(Math.max(durationMsRef.current, recorder.currentTime * 1000)),
      );
      const waveform = downsampleWaveform(waveformRef.current, 64);
      draftUriRef.current = uri;
      setDraft({ uri, durationMs, waveform, mimeType: 'audio/mp4' });
    } finally {
      await audio.setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false }).catch(() => undefined);
    }
  };

  const start = async () => {
    if (!enabled || sending || draft || arming || recorderState.isRecording) return;
    releaseRequested.current = false;
    waveformRef.current = [];
    durationMsRef.current = 0;
    setLiveWaveform([]);
    setArming(true);
    try {
      const permission = await audio.AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Microphone access is needed', 'Allow microphone access to record a voice note.');
        return;
      }
      await audio.setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      recordingStarted.current = true;
      if (releaseRequested.current) await stop();
    } catch {
      Alert.alert('Could not start recording', 'Try again in a moment.');
    } finally {
      setArming(false);
    }
  };

  useEffect(() => {
    return () => {
      if (recordingStarted.current) void recorder.stop();
      removeLocalRecording(draftUriRef.current);
      void audio.setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false }).catch(() => undefined);
    };
  }, [audio, recorder]);

  const trigger = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={enabled ? 'Hold to record a voice note' : 'Voice notes are unavailable in this conversation'}
      accessibilityHint={enabled ? 'Hold to record. Release to review before sending.' : undefined}
      disabled={!enabled || sending}
      onPressIn={() => {
        setTriggerPressed(true);
        void start();
      }}
      onPressOut={() => {
        setTriggerPressed(false);
        void stop();
      }}
      testID="voice-note-record"
      style={{
        width: 36,
        height: 36,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: recorderState.isRecording || arming ? colors.blush : colors.neutral[100],
        opacity: enabled && !sending ? (triggerPressed ? 0.72 : 1) : 0.4,
      }}
    >
      {arming ? <ActivityIndicator size="small" color={colors.ink} /> : <Mic size={18} color={recorderState.isRecording ? colors.danger : colors.ink} strokeWidth={2.3} />}
    </Pressable>
  );

  const review = draft ? (
    <VoiceNoteReview
      audio={audio}
      draft={draft}
      sending={sending}
      onDiscard={() => {
        removeLocalRecording(draft.uri);
        draftUriRef.current = null;
        setDraft(null);
      }}
      onSend={() => {
        void onSend(draft)
          .then(() => {
            removeLocalRecording(draft.uri);
            draftUriRef.current = null;
            setDraft(null);
          })
          // The chat route renders the delivery error and preserves this
          // reviewed draft so the person can retry or discard it.
          .catch(() => undefined);
      }}
    />
  ) : recorderState.isRecording || arming ? (
    <View
      testID="voice-note-recording"
      style={{
        minHeight: 46,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 7,
        paddingHorizontal: 10,
        borderWidth: 1,
        borderColor: colors.blush,
        borderRadius: 15,
        backgroundColor: colors.paper,
      }}
    >
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.danger }} />
      <VoiceWaveform
        samples={liveWaveform}
        playedColor={colors.danger}
        remainingColor={colors.neutral[200]}
        progress={1}
        style={{ flex: 1, minHeight: 28 }}
      />
      <Text selectable style={{ ...mobileType.label, color: colors.ink, fontVariant: ['tabular-nums'] }}>
        {formatAudioDuration(recorderState.durationMillis / 1000)}
      </Text>
    </View>
  ) : null;

  return <>{children({ trigger, review })}</>;
}

const roundControlStyle = {
  width: 30,
  height: 30,
  borderRadius: 10,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  backgroundColor: colors.neutral[100],
};
