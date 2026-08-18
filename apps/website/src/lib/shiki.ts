// SPDX-License-Identifier: Apache-2.0
import { createHighlighter, type BundledLanguage } from 'shiki';
import { claireCodeTheme } from '@/lib/shiki-theme';

/**
 * Languages actually used across Claire's documentation. Keeping the list
 * explicit means the highlighter loads a handful of grammars instead of the
 * full bundle, and an unknown `lang` fails loudly during `build-docs` rather
 * than silently rendering unhighlighted.
 */
export const codeLanguages = [
  'bash',
  'css',
  'diff',
  'docker',
  'html',
  'ini',
  'javascript',
  'json',
  'jsonc',
  'kotlin',
  'markdown',
  'python',
  'sql',
  'swift',
  'toml',
  'tsx',
  'typescript',
  'xml',
  'yaml',
] as const satisfies readonly BundledLanguage[];

export type CodeLanguage = (typeof codeLanguages)[number] | 'text';

const aliases: Record<string, CodeLanguage> = {
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  console: 'bash',
  js: 'javascript',
  ts: 'typescript',
  jsx: 'tsx',
  md: 'markdown',
  yml: 'yaml',
  env: 'ini',
  dockerfile: 'docker',
  plaintext: 'text',
  txt: 'text',
};

export function normalizeLanguage(lang: string): CodeLanguage {
  const lower = lang.toLowerCase();
  if (lower in aliases) return aliases[lower];
  if ((codeLanguages as readonly string[]).includes(lower)) return lower as CodeLanguage;
  return 'text';
}

/**
 * Created once at module load with a top-level await so that `highlight()` is
 * synchronous. That matters: doc pages must render inside
 * `renderToStaticMarkup` during text extraction, which cannot await async
 * components.
 */
const highlighter = await createHighlighter({
  themes: [claireCodeTheme],
  langs: [...codeLanguages],
});

export function highlight(code: string, lang: string): string {
  const language = normalizeLanguage(lang);
  return highlighter.codeToHtml(code, {
    lang: language === 'text' ? 'txt' : language,
    theme: 'claire',
  });
}
