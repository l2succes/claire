// SPDX-License-Identifier: Apache-2.0
import type { ThemeRegistrationRaw } from 'shiki';

/**
 * Claire's code theme: graphite surface, near-neutral text, lime reserved for
 * the tokens that carry structure (keywords, tags, operators-of-meaning) and a
 * sage green for literals. Deliberately two-hue — code should read as a quiet
 * terminal panel inside the page, not as a second brand.
 *
 * Code surfaces stay dark in both light and dark mode, so this is the only
 * theme; there is no light variant to keep in sync.
 */
export const claireCodeTheme: ThemeRegistrationRaw = {
  name: 'claire',
  type: 'dark',
  colors: {
    'editor.background': '#1a1e19',
    'editor.foreground': '#e8ece3',
  },
  settings: [
    { settings: { background: '#1a1e19', foreground: '#e8ece3' } },
    {
      scope: ['comment', 'punctuation.definition.comment', 'string.comment'],
      settings: { foreground: '#727a69', fontStyle: 'italic' },
    },
    {
      scope: [
        'keyword',
        'keyword.control',
        'keyword.operator.expression',
        'keyword.operator.new',
        'storage',
        'storage.type',
        'storage.modifier',
        'entity.name.tag',
        'meta.tag',
        'markup.heading',
        'punctuation.definition.heading',
      ],
      settings: { foreground: '#dfff64' },
    },
    {
      scope: ['string', 'string.quoted', 'string.template', 'markup.inserted', 'meta.attribute-selector'],
      settings: { foreground: '#a9d69b' },
    },
    {
      scope: [
        'constant.numeric',
        'constant.language',
        'constant.character',
        'constant.other',
        'support.constant',
        'variable.other.constant',
      ],
      settings: { foreground: '#cfe89b' },
    },
    {
      scope: [
        'entity.name.function',
        'support.function',
        'meta.function-call',
        'entity.name.class',
        'entity.name.type',
        'support.class',
        'support.type',
      ],
      settings: { foreground: '#f2f5ec' },
    },
    {
      scope: [
        'variable',
        'variable.other',
        'variable.parameter',
        'meta.object-literal.key',
        'support.variable',
        'entity.other.attribute-name',
      ],
      settings: { foreground: '#cdd4c3' },
    },
    {
      scope: [
        'punctuation',
        'meta.brace',
        'keyword.operator',
        'punctuation.separator',
        'punctuation.terminator',
      ],
      settings: { foreground: '#96a08c' },
    },
    {
      scope: ['invalid', 'markup.deleted'],
      settings: { foreground: '#ff9d8a' },
    },
    {
      scope: ['markup.italic'],
      settings: { fontStyle: 'italic' },
    },
    {
      scope: ['markup.bold'],
      settings: { fontStyle: 'bold' },
    },
  ],
};
