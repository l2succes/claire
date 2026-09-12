/**
 * Demo persona pack
 *
 * The cast and scripted history for a demo account. Everyone here is invented;
 * no real person's name, number, handle, or photo appears in this file.
 *
 * Two things this file is responsible for:
 *
 *  1. **Believable history.** Scripted lines carry a wall-clock time in one
 *     timezone and an age in days, resolved against `now` at seed time — so a
 *     freshly seeded inbox is always "last three weeks", never a fixed 2026
 *     date that reads as stale on camera.
 *
 *  2. **Character sheets.** Each persona carries the guidance the responder
 *     needs to answer in voice when the demo user writes to them. The sheet is
 *     prose on purpose: it is fed to a model, not matched by code.
 *
 * The scripted content is written backwards from the surfaces worth filming —
 * see FILMABLE_SURFACES at the bottom for the map from a demo beat to the
 * conversation that produces it.
 */

import { Platform } from '../adapters/types';

// ─── Timezone resolution ───────────────────────────────────────────────────

/** The demo account's home timezone. Scripted clock times are wall-clock here. */
export const DEMO_TIMEZONE = 'America/New_York';

const DAY_MS = 86_400_000;

/** Offset between the demo timezone and UTC at a given instant, in ms. */
function zoneOffsetMs(instant: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: DEMO_TIMEZONE,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
  return asUtc - instant.getTime();
}

/** Resolve a wall-clock time on the day `daysAgo` days before `now`. */
function wallClockOn(now: Date, daysAgo: number, hour: number, minute: number): Date {
  const target = new Date(now.getTime() - daysAgo * DAY_MS);
  const dateParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: DEMO_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(target);
  const get = (type: string) => Number(dateParts.find((p) => p.type === type)?.value ?? 0);

  const guess = Date.UTC(get('year'), get('month') - 1, get('day'), hour, minute);
  return new Date(guess - zoneOffsetMs(new Date(guess)));
}

/**
 * Resolve a scripted line to an absolute instant.
 *
 * A future timestamp would be visible on camera as a message from "later today"
 * sorting above everything else, so a line whose clock time has not happened
 * yet is moved to the same time a day earlier rather than clamped to now. That
 * matters when seeding in the morning: half the "today" lines would otherwise
 * collapse onto one timestamp, and a 9am message would stop reading as a
 * morning message.
 */
export function resolveScriptTime(line: DemoScriptLine, now: Date): Date {
  if (line.at === undefined) {
    const minutes = line.minutesAgo ?? 0;
    return new Date(now.getTime() - minutes * 60_000);
  }

  const [hour, minute] = line.at.split(':').map(Number);
  const daysAgo = line.daysAgo ?? 0;

  for (let shift = 0; shift <= 2; shift += 1) {
    const resolved = wallClockOn(now, daysAgo + shift, hour, minute);
    if (resolved.getTime() < now.getTime()) return resolved;
  }
  return new Date(now.getTime() - 120_000);
}

// ─── Types ─────────────────────────────────────────────────────────────────

/** How a persona texts. Feeds the responder's style instructions. */
export interface DemoReplyStyle {
  /** Typical reply length in words, as [min, max]. Kept short — these are texts. */
  words: [number, number];
  emoji: 'none' | 'sparse' | 'frequent';
  /** Probability this persona sends a follow-up bubble instead of one message. */
  splitChance: number;
  /** Probability they reply at all when written to (some people are slow). */
  replyChance: number;
}

export interface DemoPersonaSheet {
  /** Who they are to the demo user, in one line. */
  relationship: string;
  /** Voice and texting habits, as prose for the model. */
  voice: string;
  /** What they talk about. */
  topics: string[];
  /** Live threads the persona should stay consistent with. */
  openThreads: string[];
  replyStyle: DemoReplyStyle;
}

export interface DemoPersona {
  key: string;
  displayName: string;
  platform: Platform;
  /** Platform-native identifier: phone for WhatsApp, numeric id for Telegram. */
  platformContactId: string;
  phoneNumber?: string;
  username?: string;
  avatarUrl: string;
  sheet: DemoPersonaSheet;
}

export interface DemoScriptLine {
  /** 'me' is the demo account owner; anything else is a persona key. */
  from: 'me' | string;
  text: string;
  /** Whole days back from seed time. Omit for the most recent lines. */
  daysAgo?: number;
  /** Wall-clock time in DEMO_TIMEZONE, "HH:MM". Omit to use minutesAgo. */
  at?: string;
  /** Used instead of daysAgo/at, for "just now" lines. */
  minutesAgo?: number;
}

export interface DemoChat {
  key: string;
  platform: Platform;
  platformChatId: string;
  name: string;
  isGroup: boolean;
  /** Persona keys in the room. A 1:1 chat has exactly one. */
  participants: string[];
  /** Extra context handed to the responder for group dynamics. */
  groupContext?: string;
  script: DemoScriptLine[];
}

// ─── Avatars ───────────────────────────────────────────────────────────────

/**
 * Illustrated avatars, deterministic per persona. Generated art rather than
 * stock photography: a demo should not put a real person's face next to an
 * invented name and an invented conversation.
 */
function avatar(seed: string): string {
  return `https://api.dicebear.com/9.x/notionists/png?seed=${encodeURIComponent(seed)}&size=256&backgroundType=gradientLinear`;
}

// ─── The cast ──────────────────────────────────────────────────────────────

export const DEMO_PERSONAS: DemoPersona[] = [
  {
    key: 'amara',
    displayName: 'Amara Okonkwo',
    platform: Platform.WHATSAPP,
    platformContactId: '15550138871',
    phoneNumber: '+1 555 013 8871',
    avatarUrl: avatar('amara-okonkwo'),
    sheet: {
      relationship:
        'Close friend of eight years. Met working at the same startup; she moved to Chicago two years ago and they text most weeks.',
      voice:
        'Warm and quick. Types in lowercase, rarely punctuates the end of a sentence, and sends two or three short bubbles instead of one long one. Teases him gently. Uses "lol" sparingly and never uses formal greetings — she just starts talking mid-thought.',
      topics: ['her trip to New York', 'her job hunt', 'mutual friends', 'his startup, which she is genuinely curious about'],
      openThreads: [
        'She lands at JFK Thursday 6:40pm on Delta 1422 and is staying four nights.',
        'She asked him to pick a dinner spot for Friday and he has not answered yet.',
        'She just left a job at a fintech and is interviewing, slightly anxious about it.',
      ],
      replyStyle: { words: [4, 18], emoji: 'sparse', splitChance: 0.45, replyChance: 0.95 },
    },
  },
  {
    key: 'dele',
    displayName: 'Dele Adeyemi',
    platform: Platform.WHATSAPP,
    platformContactId: '2348061142207',
    phoneNumber: '+234 806 114 2207',
    avatarUrl: avatar('dele-adeyemi'),
    sheet: {
      relationship: 'Older cousin in Lagos. The family organiser — handles logistics for everyone.',
      voice:
        'Nigerian English, familiar and direct. Uses "abeg", "sharp sharp", "no wahala", "how far". Short lines. Occasionally sends the same thought twice for emphasis. Calls him "cuz". Not much punctuation, no emoji beyond the occasional 🙏.',
      topics: ['grandma\'s 80th birthday', 'family logistics', 'who is contributing what', 'when he is next coming home'],
      openThreads: [
        'Grandma turns 80 on the 4th of next month; the family is splitting the cost of the party.',
        'He asked the demo user for $400 toward the cake and decorations. The user said he would send it — and has not yet.',
        'Dele wants to know if the user is flying in for the party.',
      ],
      replyStyle: { words: [3, 14], emoji: 'none', splitChance: 0.4, replyChance: 0.9 },
    },
  },
  {
    key: 'priya',
    displayName: 'Priya Raghunathan',
    platform: Platform.TELEGRAM,
    platformContactId: '584120993',
    username: '@priyadraws',
    avatarUrl: avatar('priya-raghunathan'),
    sheet: {
      relationship:
        'Freelance product designer, contracted for six weeks to redesign the onboarding flow. Professional but friendly — they get on well.',
      voice:
        'Clear and organised. Full sentences, proper capitalisation, but not stiff. Uses "—" and occasionally a numbered list for options. Flags blockers explicitly rather than hinting. One emoji at most, usually 👍 or 🙌.',
      topics: ['the onboarding redesign', 'design handoff', 'feedback she is waiting on', 'her invoice'],
      openThreads: [
        'She owes the final Figma handoff file; she said Tuesday and it is now overdue by a day.',
        'She is waiting on the demo user\'s feedback on the empty-state screens before she can finish.',
        'The studio address she shared is 41 Wythe Ave, 3rd floor, Brooklyn — the shoot space, for a photographer.',
        'Her second invoice is unsent because the contract end date moved.',
      ],
      replyStyle: { words: [10, 40], emoji: 'sparse', splitChance: 0.15, replyChance: 1 },
    },
  },
  {
    key: 'tomas',
    displayName: 'Tomas Lindqvist',
    platform: Platform.TELEGRAM,
    platformContactId: '297441038',
    username: '@tlindqvist',
    avatarUrl: avatar('tomas-lindqvist'),
    sheet: {
      relationship:
        'Angel investor and advisor. Wrote a small early cheque. Well-connected, generous with intros, but his time is scarce and he notices when someone is slow.',
      voice:
        'Dense and efficient. Complete sentences, no filler, no emoji. Often closes with a concrete ask or a date. Polite but never chatty — he is typing between meetings. Signs off with "Best" only in longer messages.',
      topics: ['the deck', 'an intro to a fund', 'metrics', 'the next round'],
      openThreads: [
        'He offered an intro to a partner at Northmark Ventures and needs the updated deck to forward it.',
        'The demo user promised the deck by Friday. That promise is the single most important open commitment in the account.',
        'They settled on a call for Wednesday 10am after considering Tuesday 2pm.',
        'He asked for month-over-month retention, which has not been sent.',
      ],
      replyStyle: { words: [12, 45], emoji: 'none', splitChance: 0.05, replyChance: 1 },
    },
  },
  {
    key: 'kenji',
    displayName: 'Kenji Watanabe',
    platform: Platform.TELEGRAM,
    platformContactId: '733920144',
    username: '@kenjibuilds',
    avatarUrl: avatar('kenji-watanabe'),
    sheet: {
      relationship:
        'Indie developer friend, met through an online community. They trade technical notes and complain about the same tooling.',
      voice:
        'Casual technical shorthand. Lowercase, drops subjects ("works fine here", "gonna try it"). Sends links with one line of context. Dry humour. Uses "lol" and the occasional 😅.',
      topics: ['bridge libraries', 'self-hosting', 'side projects', 'whatever he is debugging at 1am'],
      openThreads: [
        'He asked whether the demo user ever tried the new bridge library he linked. Still unanswered.',
        'He is rewriting his own sync layer and keeps hitting the same race condition.',
      ],
      replyStyle: { words: [5, 25], emoji: 'sparse', splitChance: 0.3, replyChance: 0.85 },
    },
  },
  {
    key: 'nina',
    displayName: 'Nina Castellanos',
    platform: Platform.INSTAGRAM,
    platformContactId: '17841409922104',
    username: '@ninacastellanos',
    avatarUrl: avatar('nina-castellanos'),
    sheet: {
      relationship:
        'Photographer. They met at a conference two months ago and she pitched shooting brand photography for the product.',
      voice:
        'Short Instagram DMs. Lowercase, generous with emoji, often one line at a time. Enthusiastic and a little informal. Uses "!!" and "✨".',
      topics: ['the brand shoot', 'budget', 'her availability', 'the studio location'],
      openThreads: [
        'She asked what the budget looks like and has had no answer. This is the newest unanswered question in the account.',
        'She is free the week of the 22nd and holding two days.',
        'She needs the studio address confirmed — she does not have it.',
      ],
      replyStyle: { words: [3, 16], emoji: 'frequent', splitChance: 0.5, replyChance: 0.95 },
    },
  },
  {
    key: 'marcus',
    displayName: 'Marcus Bell',
    platform: Platform.INSTAGRAM,
    platformContactId: '17841338820917',
    username: '@marcusbell',
    avatarUrl: avatar('marcus-bell'),
    sheet: {
      relationship: 'Old schoolmate, back in touch after years. Friendly but not close.',
      voice:
        'Low-key and a bit formal for Instagram, as though unsure how much to write. Proper capitalisation. No emoji. Slightly long gaps between replies.',
      topics: ['catching up', 'what the user is building now', 'people from school'],
      openThreads: ['He floated getting a coffee "sometime soon" with no date attached.'],
      replyStyle: { words: [8, 28], emoji: 'none', splitChance: 0.1, replyChance: 0.7 },
    },
  },
  {
    key: 'rahim',
    displayName: 'Rahim Osei',
    platform: Platform.WHATSAPP,
    platformContactId: '15550177324',
    phoneNumber: '+1 555 017 7324',
    avatarUrl: avatar('rahim-osei'),
    sheet: {
      relationship: 'Friend from the Saturday football group. Organises the pitch booking.',
      voice: 'Blunt and funny. Lowercase, fast, mild swearing replaced with "smh". Uses ⚽️ and 😂.',
      topics: ['football', 'the pitch booking', 'who is actually showing up'],
      openThreads: [
        'The pitch is booked Saturday 9am at Red Hook. He is chasing who is bringing the bibs.',
        'Two people dropped out this week and he needs one more player.',
      ],
      replyStyle: { words: [3, 15], emoji: 'sparse', splitChance: 0.35, replyChance: 0.9 },
    },
  },
  {
    key: 'sofia',
    displayName: 'Sofia Almeida',
    platform: Platform.TELEGRAM,
    platformContactId: '846201773',
    username: '@sofia_almeida',
    avatarUrl: avatar('sofia-almeida'),
    sheet: {
      relationship: 'Beta tester, found the product through a launch post. Detailed, generous bug reporter.',
      voice:
        'Precise and helpful. Writes numbered reproduction steps unprompted. Friendly sign-offs. Uses 🙂 occasionally.',
      topics: ['bugs she has found', 'feature requests', 'how other testers are getting on'],
      openThreads: [
        'She reported that the unread badge does not clear on one device until the app is restarted.',
        'She asked whether a desktop build is planned.',
      ],
      replyStyle: { words: [12, 40], emoji: 'sparse', splitChance: 0.1, replyChance: 0.95 },
    },
  },
];

export const DEMO_PERSONAS_BY_KEY: Record<string, DemoPersona> = Object.fromEntries(
  DEMO_PERSONAS.map((persona) => [persona.key, persona])
);

// ─── Scripted conversations ────────────────────────────────────────────────

export const DEMO_CHATS: DemoChat[] = [
  // ── WhatsApp · Amara ────────────────────────────────────────────────────
  // Recent, warm, ends on an unanswered question about dinner. Also carries
  // the flight details that Ask Claire should be able to recall.
  {
    key: 'amara',
    platform: Platform.WHATSAPP,
    platformChatId: '15550138871',
    name: 'Amara Okonkwo',
    isGroup: false,
    participants: ['amara'],
    script: [
      { from: 'amara', text: 'okay it is official, i booked it', daysAgo: 9, at: '21:14' },
      { from: 'me', text: 'wait for real? when do you land', daysAgo: 9, at: '21:31' },
      { from: 'amara', text: 'thursday 6:40pm, delta 1422 into jfk', daysAgo: 9, at: '21:33' },
      { from: 'amara', text: 'staying four nights, i found a place in bed stuy', daysAgo: 9, at: '21:33' },
      { from: 'me', text: 'this is great news. i can get you from the airport', daysAgo: 9, at: '21:40' },
      { from: 'amara', text: 'you do not have to do that', daysAgo: 9, at: '21:42' },
      { from: 'me', text: 'i know. i want to', daysAgo: 9, at: '21:44' },
      { from: 'amara', text: '🥹 ok fine', daysAgo: 9, at: '21:45' },
      { from: 'amara', text: 'how is the thing going anyway. the app', daysAgo: 6, at: '13:02' },
      {
        from: 'me',
        text: 'honestly all over the place. good week though, we got the onboarding redesign back from the designer',
        daysAgo: 6,
        at: '13:20',
      },
      { from: 'amara', text: 'i still do not fully understand what it does lol', daysAgo: 6, at: '13:22' },
      {
        from: 'me',
        text: 'it puts every messaging app in one inbox and an assistant on top that actually remembers what you promised people',
        daysAgo: 6,
        at: '13:25',
      },
      { from: 'amara', text: 'okay that i understand. i need that badly', daysAgo: 6, at: '13:26' },
      { from: 'amara', text: 'also the interview went fine i think', daysAgo: 3, at: '19:48' },
      { from: 'me', text: 'fine as in good or fine as in you are spiralling', daysAgo: 3, at: '20:02' },
      { from: 'amara', text: 'the second one obviously', daysAgo: 3, at: '20:03' },
      { from: 'amara', text: 'they said two weeks which feels like a no', daysAgo: 3, at: '20:03' },
      { from: 'me', text: 'two weeks is just two weeks. it is not a signal', daysAgo: 3, at: '20:11' },
      { from: 'amara', text: 'this is why i text you', daysAgo: 3, at: '20:12' },
      { from: 'amara', text: 'ok so friday night. you are picking the place', daysAgo: 1, at: '11:26' },
      { from: 'amara', text: 'somewhere i cannot get in chicago please', daysAgo: 1, at: '11:26' },
      { from: 'amara', text: 'did you pick somewhere or are you going to send me a screenshot at 6pm friday', minutesAgo: 214 },
    ],
  },

  // ── WhatsApp · Dele ─────────────────────────────────────────────────────
  // Family logistics. Carries a commitment the demo user made and has not kept.
  {
    key: 'dele',
    platform: Platform.WHATSAPP,
    platformChatId: '2348061142207',
    name: 'Dele Adeyemi',
    isGroup: false,
    participants: ['dele'],
    script: [
      { from: 'dele', text: 'how far cuz', daysAgo: 12, at: '08:12' },
      { from: 'dele', text: 'so grandma is turning 80 on the 4th', daysAgo: 12, at: '08:12' },
      { from: 'me', text: 'I know. I have been thinking about it', daysAgo: 12, at: '09:30' },
      { from: 'dele', text: 'we are doing something proper at the house. maybe 60 people', daysAgo: 12, at: '09:41' },
      { from: 'dele', text: 'aunty funke is doing the food, i am handling cake and decorations', daysAgo: 12, at: '09:41' },
      { from: 'me', text: 'what do you need from me', daysAgo: 12, at: '09:55' },
      { from: 'dele', text: 'if you can do 400 for the cake and the decorations that covers it', daysAgo: 12, at: '10:03' },
      { from: 'me', text: "That's fine. I'll send the $400 tomorrow", daysAgo: 12, at: '10:10' },
      { from: 'dele', text: 'no wahala 🙏', daysAgo: 12, at: '10:11' },
      { from: 'dele', text: 'cuz did you send it', daysAgo: 7, at: '07:48' },
      { from: 'me', text: 'Not yet — this week has been rough. Sending it', daysAgo: 7, at: '12:15' },
      { from: 'dele', text: 'ok ok. baker wants half up front before she starts', daysAgo: 7, at: '12:31' },
      { from: 'dele', text: 'also are you coming or not. tell me now so i can count you for the food', daysAgo: 4, at: '06:55' },
      { from: 'me', text: 'Trying to make it work. I will know by the weekend', daysAgo: 4, at: '08:40' },
      { from: 'dele', text: 'sharp sharp', daysAgo: 4, at: '08:44' },
      { from: 'dele', text: 'cuz the baker called me again this morning', daysAgo: 1, at: '07:20' },
    ],
  },

  // ── Telegram · Tomas ────────────────────────────────────────────────────
  // The highest-stakes open commitment, plus a resolved scheduling thread.
  {
    key: 'tomas',
    platform: Platform.TELEGRAM,
    platformChatId: '297441038',
    name: 'Tomas Lindqvist',
    isGroup: false,
    participants: ['tomas'],
    script: [
      {
        from: 'tomas',
        text: 'Good call yesterday. I mentioned you to Elena Vasquez, a partner at Northmark Ventures — they are actively looking at messaging infrastructure.',
        daysAgo: 11,
        at: '09:05',
      },
      { from: 'tomas', text: 'Happy to forward something. Do you have an updated deck?', daysAgo: 11, at: '09:06' },
      { from: 'me', text: 'That would be huge. The deck is close, it needs the new retention numbers in it', daysAgo: 11, at: '10:12' },
      {
        from: 'tomas',
        text: 'Send it when it is ready. One suggestion: lead with retention rather than the integration count. Integrations read as roadmap, retention reads as product.',
        daysAgo: 11,
        at: '10:40',
      },
      { from: 'me', text: 'Noted. That is good framing', daysAgo: 11, at: '10:52' },
      { from: 'tomas', text: 'Also, shall we do a proper call? Tuesday 2pm or Wednesday 10am both work for me.', daysAgo: 8, at: '14:22' },
      { from: 'me', text: 'Wednesday 10am is better for me', daysAgo: 8, at: '15:01' },
      { from: 'tomas', text: 'Wednesday 10am it is. I will send an invite.', daysAgo: 8, at: '15:04' },
      {
        from: 'tomas',
        text: 'Before the call, can you pull month-over-month retention for the last six cohorts? Not a polished chart, the raw numbers are fine.',
        daysAgo: 8,
        at: '15:06',
      },
      { from: 'me', text: 'Yes, I will have that', daysAgo: 8, at: '15:22' },
      { from: 'tomas', text: 'Elena asked me again about the deck today. Any update?', daysAgo: 3, at: '11:30' },
      { from: 'me', text: "Sorry — it's been a week. I'll send you the deck by Friday", daysAgo: 3, at: '13:45' },
      { from: 'tomas', text: 'Understood. Friday works, she is travelling next week so it is a good window.', daysAgo: 3, at: '13:58' },
      { from: 'tomas', text: 'Following up on the deck and the retention numbers.', daysAgo: 0, at: '08:15' },
    ],
  },

  // ── Telegram · Priya ────────────────────────────────────────────────────
  // A commitment the *other* side owes, plus the studio address for cross-chat
  // recall from Nina's Instagram thread.
  {
    key: 'priya',
    platform: Platform.TELEGRAM,
    platformChatId: '584120993',
    name: 'Priya Raghunathan',
    isGroup: false,
    participants: ['priya'],
    script: [
      {
        from: 'priya',
        text: 'Morning! Pushed the second pass on onboarding — three screens reworked, and I split the permission step into two so it does not ask for everything at once.',
        daysAgo: 10,
        at: '09:48',
      },
      { from: 'me', text: 'Looking now', daysAgo: 10, at: '11:20' },
      { from: 'me', text: 'The split permission step is much better. The illustration on screen 2 feels off though', daysAgo: 10, at: '11:38' },
      {
        from: 'priya',
        text: 'Agreed, it is a placeholder. I have two directions for it — one illustrated, one photographic. I will show both.',
        daysAgo: 10,
        at: '11:52',
      },
      {
        from: 'priya',
        text: 'On the photographic direction: if you are doing a brand shoot anyway, the space I used last time is 41 Wythe Ave, 3rd floor, Brooklyn. Good north light, they rent by the half day.',
        daysAgo: 10,
        at: '11:55',
      },
      { from: 'me', text: 'Noted, that is useful. I have a photographer who wants to do it', daysAgo: 10, at: '12:30' },
      { from: 'priya', text: 'Can you get me feedback on the empty states this week? I am blocked on those before I can finish the handoff.', daysAgo: 6, at: '10:05' },
      { from: 'me', text: 'Yes — by Wednesday', daysAgo: 6, at: '10:31' },
      { from: 'priya', text: 'I will have the final handoff file to you Tuesday either way 👍', daysAgo: 6, at: '10:33' },
      { from: 'priya', text: 'Quick one — the contract end date moved, so should I invoice for the extra week separately or roll it into the final invoice?', daysAgo: 2, at: '16:40' },
      { from: 'priya', text: 'Also still need those empty-state notes when you get a moment 🙌', daysAgo: 0, at: '09:22' },
    ],
  },

  // ── Telegram · Kenji ────────────────────────────────────────────────────
  // Low-stakes, ends on an unanswered technical question.
  {
    key: 'kenji',
    platform: Platform.TELEGRAM,
    platformChatId: '733920144',
    name: 'Kenji Watanabe',
    isGroup: false,
    participants: ['kenji'],
    script: [
      { from: 'kenji', text: 'okay so the race condition was me. of course it was me', daysAgo: 13, at: '01:42' },
      { from: 'me', text: 'what was it', daysAgo: 13, at: '09:15' },
      { from: 'kenji', text: 'two writers on the same cursor, no lock. classic. three days of my life', daysAgo: 13, at: '09:40' },
      { from: 'me', text: 'I have lost a week to worse', daysAgo: 13, at: '09:44' },
      { from: 'kenji', text: 'how are you handling ordering when a bridge backfills out of order', daysAgo: 13, at: '09:50' },
      { from: 'me', text: 'badly. we sort on the platform timestamp and accept that backfill lands at the end', daysAgo: 13, at: '10:20' },
      { from: 'kenji', text: 'yeah that is what everyone does', daysAgo: 13, at: '10:22' },
      { from: 'kenji', text: 'there is a newer lib that claims to fix it, i will dig up the link', daysAgo: 13, at: '10:23' },
      { from: 'kenji', text: 'found it, sending later when i am at the desk', daysAgo: 5, at: '23:11' },
      { from: 'kenji', text: 'did you ever try that bridge lib i mentioned', daysAgo: 2, at: '22:35' },
    ],
  },

  // ── Instagram · Nina ────────────────────────────────────────────────────
  // The newest unanswered question in the account, and a question whose answer
  // lives in Priya's Telegram thread.
  {
    key: 'nina',
    platform: Platform.INSTAGRAM,
    platformChatId: '17841409922104',
    name: 'Nina Castellanos',
    isGroup: false,
    participants: ['nina'],
    script: [
      { from: 'nina', text: 'hiii! so good to meet you at the conference ✨', daysAgo: 14, at: '18:20' },
      { from: 'nina', text: 'i keep thinking about what you said about the product photos', daysAgo: 14, at: '18:21' },
      { from: 'me', text: 'Likewise! And yes — we need real photography badly, everything we have is stock', daysAgo: 14, at: '19:05' },
      { from: 'nina', text: 'i would love to do it 🙌', daysAgo: 14, at: '19:12' },
      { from: 'nina', text: 'i do a lot of founder + product stuff, natural light, not corporate', daysAgo: 14, at: '19:12' },
      { from: 'me', text: 'That is exactly the direction. Let me figure out timing on our end', daysAgo: 14, at: '19:40' },
      { from: 'nina', text: 'no rush!! i am holding two days the week of the 22nd just in case', daysAgo: 7, at: '12:15' },
      { from: 'nina', text: 'also where would we shoot? do you have a space or should i find one', daysAgo: 7, at: '12:16' },
      { from: 'me', text: 'I might have a space actually, let me confirm', daysAgo: 7, at: '14:02' },
      { from: 'nina', text: 'perfect 😍', daysAgo: 7, at: '14:20' },
      { from: 'nina', text: 'hey! so the week of the 22nd is filling up', minutesAgo: 96 },
      { from: 'nina', text: 'so what is the budget looking like? just so i know what we can do', minutesAgo: 94 },
    ],
  },

  // ── Instagram · Marcus ──────────────────────────────────────────────────
  // Deliberately quiet. Not every thread in a real inbox is urgent.
  {
    key: 'marcus',
    platform: Platform.INSTAGRAM,
    platformChatId: '17841338820917',
    name: 'Marcus Bell',
    isGroup: false,
    participants: ['marcus'],
    script: [
      { from: 'marcus', text: 'Hey, is this the right account? Marcus from St. Andrews.', daysAgo: 20, at: '22:40' },
      { from: 'me', text: 'Marcus! It is. Been a long time', daysAgo: 19, at: '08:12' },
      { from: 'marcus', text: 'A very long time. I saw a post about what you are building and it looked like your kind of thing.', daysAgo: 19, at: '09:30' },
      { from: 'me', text: 'It is. Eighteen months in and it finally looks like a product', daysAgo: 19, at: '10:05' },
      { from: 'marcus', text: 'Good for you. I am still in Jersey, doing something far more boring with insurance data.', daysAgo: 19, at: '10:40' },
      { from: 'marcus', text: 'We should get a coffee sometime soon. I am in the city most Thursdays.', daysAgo: 16, at: '13:15' },
    ],
  },

  // ── WhatsApp group · football ───────────────────────────────────────────
  // Volume, overlapping voices, and one real action item buried in banter.
  {
    key: 'football',
    platform: Platform.WHATSAPP,
    platformChatId: 'demo-group-redhook@g.us',
    name: 'Red Hook Saturday ⚽️',
    isGroup: true,
    participants: ['rahim', 'amara', 'marcus'],
    groupContext:
      'A Saturday 5-a-side group. Rahim books the pitch and chases people. Chaotic, affectionate, lots of dropouts. Amara is in the group from when she lived in New York and still comments occasionally.',
    script: [
      { from: 'rahim', text: 'pitch is booked. saturday 9am red hook, same as always', daysAgo: 5, at: '18:30' },
      { from: 'rahim', text: 'need a firm yes from everyone by thursday or i give the slot back', daysAgo: 5, at: '18:30' },
      { from: 'me', text: 'In', daysAgo: 5, at: '18:44' },
      { from: 'marcus', text: 'I am in as well.', daysAgo: 5, at: '19:20' },
      { from: 'rahim', text: 'that is 4. we need one more', daysAgo: 4, at: '11:02' },
      { from: 'amara', text: 'i will be in new york actually but i am not playing football at 9am, i will watch and judge', daysAgo: 4, at: '11:40' },
      { from: 'rahim', text: 'unhelpful but accepted 😂', daysAgo: 4, at: '11:44' },
      { from: 'rahim', text: 'also somebody needs to bring the bibs. mine are in the boot of a car i no longer own', daysAgo: 4, at: '11:45' },
      { from: 'marcus', text: 'How does that happen', daysAgo: 4, at: '12:10' },
      { from: 'rahim', text: 'long story', daysAgo: 4, at: '12:11' },
      { from: 'rahim', text: 'BIBS. someone. anyone', daysAgo: 2, at: '20:15' },
      { from: 'me', text: 'I can grab bibs', daysAgo: 2, at: '21:30' },
      { from: 'rahim', text: 'legend', daysAgo: 2, at: '21:31' },
      { from: 'rahim', text: 'ok final call, 2 dropped out. still need one more player for saturday, ask anyone', daysAgo: 0, at: '10:05' },
    ],
  },

  // ── Telegram group · beta testers ───────────────────────────────────────
  // Long and substantive, so a summary has something real to compress.
  {
    key: 'beta',
    platform: Platform.TELEGRAM,
    platformChatId: '-1002847710338',
    name: 'Claire beta testers',
    isGroup: true,
    participants: ['sofia', 'kenji', 'priya'],
    groupContext:
      'A small beta tester group for the product. Sofia files careful bug reports, Kenji is technical and blunt, Priya comments on design. The demo user is the maintainer and answers here.',
    script: [
      { from: 'sofia', text: 'Loving the new onboarding, the split permission step is a big improvement 🙂', daysAgo: 6, at: '09:10' },
      { from: 'priya', text: 'Thank you — that one was hard won', daysAgo: 6, at: '09:30' },
      {
        from: 'sofia',
        text: 'Small bug though. Steps: 1) open a chat on the phone, 2) read it, 3) open the same account on the second device. The unread badge stays until I fully restart the app.',
        daysAgo: 6,
        at: '09:34',
      },
      { from: 'me', text: 'That is a real one, thank you. Sounds like the read cursor is not propagating to the second device', daysAgo: 6, at: '10:15' },
      { from: 'kenji', text: 'can confirm, happens to me too. only on the second device, never the first', daysAgo: 6, at: '10:40' },
      { from: 'kenji', text: 'also search is very slow on big chats. like 3-4 seconds on a 20k message thread', daysAgo: 5, at: '23:50' },
      { from: 'me', text: 'Noted. Search is unindexed right now, that is the next thing after the badge bug', daysAgo: 5, at: '08:20' },
      { from: 'sofia', text: 'Is a desktop build planned? I do most of my messaging at a computer and the phone-only flow is the main thing stopping me using this properly.', daysAgo: 4, at: '14:05' },
      { from: 'me', text: 'Yes — there is a desktop build, it is just rough. I will get you both on it this week', daysAgo: 4, at: '15:10' },
      { from: 'sofia', text: 'Wonderful, happy to break it for you', daysAgo: 4, at: '15:12' },
      { from: 'priya', text: 'One design note: the empty state on the loops tab says "No loops" which reads as an error rather than a good state.', daysAgo: 3, at: '11:20' },
      { from: 'kenji', text: 'agree, took me a second to work out if it was broken', daysAgo: 3, at: '11:35' },
      { from: 'me', text: 'Fair. It should say something like "nothing owed either way"', daysAgo: 3, at: '12:02' },
      { from: 'sofia', text: 'That is much clearer.', daysAgo: 3, at: '12:15' },
      { from: 'kenji', text: 'badge bug is still there on todays build btw', daysAgo: 1, at: '19:40' },
      { from: 'sofia', text: 'Confirmed on my side too, second device only. Same reproduction as before.', daysAgo: 1, at: '20:05' },
    ],
  },
];

// ─── What each conversation is for ─────────────────────────────────────────

/**
 * The map from a demo beat to the conversation that produces it. Kept in the
 * source rather than a doc because whoever edits the script next needs to know
 * which line is load-bearing for which shot.
 */
export const FILMABLE_SURFACES = {
  'loop — the user owes something':
    'tomas: "I\'ll send you the deck by Friday", chased twice and still open.',
  'loop — someone owes the user':
    'priya: "I will have the final handoff file to you Tuesday", now overdue.',
  'loop — money commitment':
    'dele: "I\'ll send the $400 tomorrow", chased three times.',
  'needs reply — newest':
    'nina asks about budget 90 minutes before seed time; nothing after it.',
  'needs reply — older, low stakes':
    'kenji asks whether the bridge lib was ever tried.',
  'ask claire — scheduling recall':
    'tomas thread settles on Wednesday 10am after weighing Tuesday 2pm.',
  'ask claire — cross-chat recall':
    'nina (Instagram) needs the studio address; the address is in priya\'s Telegram thread.',
  'ask claire — travel detail recall':
    'amara gives flight DL1422, Thursday 6:40pm, JFK, four nights.',
  'group summary — buried action item':
    'football: bibs commitment and "still need one more player" under banter.',
  'group summary — substantive':
    'beta: badge bug with reproduction steps, slow search, desktop request, empty-state copy.',
  'a quiet thread':
    'marcus: a vague coffee suggestion, no urgency. Not every thread should demand something.',
} as const;

// ─── Fallback replies ──────────────────────────────────────────────────────

/**
 * In-voice replies used when the model call fails or times out.
 *
 * A demo that stalls mid-take is worse than one with a slightly generic line,
 * so every persona has something safe to say that fits their register. These
 * are deliberately content-free: they advance nothing, and any of them can
 * follow any message the demo user might send.
 */
export const DEMO_FALLBACK_REPLIES: Record<string, string[]> = {
  amara: ['one sec, on the train', 'ok hold on let me read that properly', 'wait what'],
  dele: ['ok cuz let me check and get back to you', 'i hear you', 'give me small time'],
  priya: [
    'Got it — let me look at this properly and come back to you shortly.',
    'Understood. Give me an hour and I will reply with something concrete.',
  ],
  tomas: [
    'Noted. I will come back to you on this shortly.',
    'Understood. Let me look at it properly and revert.',
  ],
  kenji: ['hold on, mid-deploy 😅', 'ok interesting, let me think', 'yeah one sec'],
  nina: ['omg one sec!! 💛', 'ahh ok let me check my calendar', 'yesss hold on'],
  marcus: ['Let me check and come back to you.', 'Understood, thanks.'],
  rahim: ['one sec', 'ok say no more', 'lol hold on'],
  sofia: [
    'Thanks — let me try that and I will report back 🙂',
    'Noted, I will test it properly and follow up.',
  ],
};

/** A neutral fallback for a persona with no specific line. */
export const DEMO_GENERIC_FALLBACK = 'one sec';
