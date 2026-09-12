export interface AssistantTextRun {
  text: string;
  bold: boolean;
}

export interface AssistantTextBlock {
  marker: string | null;
  runs: AssistantTextRun[];
}

function parseInline(value: string): AssistantTextRun[] {
  const runs: AssistantTextRun[] = [];
  const pattern = /(\*\*|__)(.+?)\1/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(value))) {
    if (match.index > cursor) runs.push({ text: value.slice(cursor, match.index), bold: false });
    runs.push({ text: match[2], bold: true });
    cursor = match.index + match[0].length;
  }
  if (cursor < value.length) runs.push({ text: value.slice(cursor), bold: false });
  return runs.length ? runs : [{ text: value, bold: false }];
}

/** A deliberately small renderer for the Markdown Claire is allowed to emit. */
export function parseAssistantText(value: string): AssistantTextBlock[] {
  return value.replace(/\r\n/g, '\n').trim().split('\n').flatMap((line) => {
    const clean = line.trim();
    if (!clean) return [];
    const bullet = clean.match(/^[-*]\s+(.*)$/);
    const numbered = clean.match(/^(\d+)[.)]\s+(.*)$/);
    const body = bullet?.[1] ?? numbered?.[2] ?? clean.replace(/^#{1,4}\s+/, '');
    return [{ marker: bullet ? '•' : numbered ? `${numbered[1]}.` : null, runs: parseInline(body) }];
  });
}
