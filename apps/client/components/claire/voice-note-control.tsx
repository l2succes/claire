import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';
import { Mic, Pause, Play, SendHorizonal, Trash2 } from 'lucide-react-native';
import { colors, mobileType } from '@claire/design-system';

type ExpoAudio = typeof import('expo-audio');

// A new TestFlight binary is required for expo-audio. Dynamic loading keeps
// an older dev client from crashing if it receives the JS update first.
let expoAudio: ExpoAudio | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  expoAudio = require('expo-audio') as ExpoAudio;
} catch {
  expoAudio = null;
}

export type VoiceNoteDraft = {
  uri: string;
  /** Whole seconds, for a stable review/send payload and accessible labels. */
  durationSeconds: number;
  mimeType: 'audio/mp4';
};

type VoiceNoteControlProps = {
  enabled: boolean;
  sending?: boolean;
  onSend: (draft: VoiceNoteDraft) => Promise<void>;
  children: (controls: { trigger: ReactNode; review: ReactNode }) => ReactNode;
};

function formatDuration(totalSeconds: number) {
  const seconds = Math.max(0, Math.round(totalSeconds));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function VoiceNoteReview({
  audio,
  draft,
  sending,
  onDiscard,
  onSend,
}: {
  audio: ExpoAudio;
  draft: VoiceNoteDraft;
  sending: boolean;
  onDiscard: () => void;
  onSend: () => void;
}) {
  const player = audio.useAudioPlayer(draft.uri);
  const status = audio.useAudioPlayerStatus(player);
  const playing = status.playing;

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
          else player.play();
        }}
        style={roundControlStyle}
      >
        {playing ? <Pause size={16} color={colors.ink} fill={colors.ink} /> : <Play size={16} color={colors.ink} fill={colors.ink} />}
      </Pressable>
      <View accessibilityLabel={`Recorded voice note, ${formatDuration(draft.durationSeconds)}`} style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, height: 16 }}>
          {[7, 13, 10, 16, 8, 14, 11, 17, 9, 13, 7, 15].map((height, index) => (
            <View
              key={index}
              style={{ width: 2, height, borderRadius: 2, backgroundColor: colors.neutral[600] }}
            />
          ))}
        </View>
        <Text style={{ ...mobileType.label, color: colors.neutral[600], marginTop: 1 }}>
          {formatDuration(draft.durationSeconds)} · Voice note
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
  if (!expoAudio) return <>{children({ trigger: null, review: null })}</>;
  return (
    <VoiceNoteControlNative
      audio={expoAudio}
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
}: VoiceNoteControlProps & { audio: ExpoAudio }) {
  const recorder = audio.useAudioRecorder(audio.RecordingPresets.HIGH_QUALITY);
  const recorderState = audio.useAudioRecorderState(recorder, 200);
  const [draft, setDraft] = useState<VoiceNoteDraft | null>(null);
  const [arming, setArming] = useState(false);
  const releaseRequested = useRef(false);
  const recordingStarted = useRef(false);

  const stop = async () => {
    releaseRequested.current = true;
    if (!recordingStarted.current) return;
    recordingStarted.current = false;
    await recorder.stop();
    const uri = recorder.uri;
    if (!uri) return;
    const durationSeconds = Math.max(1, Math.round(recorderState.durationMillis / 1000));
    setDraft({ uri, durationSeconds, mimeType: 'audio/mp4' });
  };

  const start = async () => {
    if (!enabled || sending || draft || arming || recorderState.isRecording) return;
    releaseRequested.current = false;
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
    };
  }, [recorder]);

  const trigger = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={enabled ? 'Hold to record a voice note' : 'Voice notes are unavailable in this conversation'}
      accessibilityHint={enabled ? 'Hold to record. Release to review before sending.' : undefined}
      disabled={!enabled || sending}
      onPressIn={() => void start()}
      onPressOut={() => void stop()}
      testID="voice-note-record"
      style={({ pressed }) => [
        {
          width: 36,
          height: 36,
          borderRadius: 12,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: recorderState.isRecording || arming ? colors.blush : colors.neutral[100],
          opacity: enabled && !sending ? (pressed ? 0.72 : 1) : 0.4,
        },
      ]}
    >
      {arming ? <ActivityIndicator size="small" color={colors.ink} /> : <Mic size={18} color={recorderState.isRecording ? colors.danger : colors.ink} strokeWidth={2.3} />}
    </Pressable>
  );

  const review = draft ? (
    <VoiceNoteReview
      audio={audio}
      draft={draft}
      sending={sending}
      onDiscard={() => setDraft(null)}
      onSend={() => {
        void onSend(draft)
          .then(() => setDraft(null))
          // The chat route renders the delivery error and preserves this
          // reviewed draft so the person can retry or discard it.
          .catch(() => undefined);
      }}
    />
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
