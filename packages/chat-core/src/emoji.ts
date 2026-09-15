// One visual emoji can contain variation selectors, skin tones, a ZWJ chain,
// or two regional indicators. Match the whole grapheme so emoji-plus-text and
// multiple emoji retain the ordinary message bubble.
const EMOJI_COMPONENT = String.raw`\p{Extended_Pictographic}(?:\uFE0E|\uFE0F)?(?:\p{Emoji_Modifier})?`;
const SINGLE_EMOJI = new RegExp(
  String.raw`^(?:${EMOJI_COMPONENT}(?:\u200D${EMOJI_COMPONENT})*|\p{Regional_Indicator}{2}|[0-9#*](?:\uFE0F)?\u20E3)$`,
  'u',
);

export function isSingleEmojiMessage(value?: string | null): boolean {
  if (!value) return false;
  const candidate = value.trim().normalize('NFC');
  return candidate.length > 0 && SINGLE_EMOJI.test(candidate);
}

