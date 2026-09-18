import { Text, View, type StyleProp, type TextStyle } from 'react-native';
import { space } from '@claire/design-system';
import { parseAssistantText } from './assistant-text';

export function AssistantRichText({ content, style }: { content: string; style: StyleProp<TextStyle> }) {
  const blocks = parseAssistantText(content);
  return (
    <View style={{ gap: space[2] }} accessibilityLabel={content}>
      {blocks.map((block, blockIndex) => (
        <Text key={`${blockIndex}-${block.marker || 'p'}`} selectable style={style}>
          {block.marker ? <Text style={[style, { fontWeight: '700' }]}>{block.marker} </Text> : null}
          {block.runs.map((run, runIndex) => (
            <Text key={runIndex} style={[style, run.bold ? { fontWeight: '800' } : null]}>{run.text}</Text>
          ))}
        </Text>
      ))}
    </View>
  );
}
