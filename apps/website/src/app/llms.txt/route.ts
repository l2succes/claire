// SPDX-License-Identifier: Apache-2.0
import { getDocs, sectionsWithDocs } from '@/lib/docs';
import { sectionLabels } from '@/lib/docs-types';

export const revalidate = false;

const SITE = 'https://claire.chat';

/** An llms.txt index of the published documentation. */
export function GET() {
  const lines: string[] = [
    '# Claire',
    '',
    '> A unified AI messenger that brings WhatsApp, Telegram, Instagram, and more into one inbox.',
    '',
    `Claire is developed in the open. The ${getDocs().length} documents below are the same ones the team works from.`,
    'Every page is also available as Markdown by appending `.md` to its URL.',
    '',
  ];

  for (const { section, docs } of sectionsWithDocs()) {
    lines.push(`## ${sectionLabels[section]}`, '');
    for (const doc of docs) {
      lines.push(`- [${doc.title}](${SITE}${doc.url}.md): ${doc.description}`);
    }
    lines.push('');
  }

  return new Response(lines.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
