import { requireNativeComponent, StyleSheet, type ViewProps } from 'react-native';

type NativeMediaPlayerProps = ViewProps & { source: string };

const NativeMediaPlayer = requireNativeComponent<NativeMediaPlayerProps>('ClaireMediaPlayer');

export function MacMediaPlayer({ source, audio = false }: { source: string; audio?: boolean }) {
  return <NativeMediaPlayer source={source} style={audio ? styles.audio : styles.video} />;
}

const styles = StyleSheet.create({
  audio: { width: 280, height: 58, borderRadius: 12, overflow: 'hidden' },
  video: { width: 320, height: 220, borderRadius: 12, overflow: 'hidden' },
});
