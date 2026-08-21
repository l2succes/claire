/**
 * Synthetic conversation generator.
 *
 * Two kinds of corpus, because they catch different things:
 *
 *   Hand-authored scenarios pin down specific behavior with precise labels.
 *     They are the acceptance criteria and they say *why* each case matters.
 *
 *   Generated scenarios vary one axis at a time across platforms, group sizes,
 *     and mention styles. They catch the cases nobody thought to write — a
 *     signal that only misfires on Slack, or only above 25 members.
 *
 * Everything is seeded and deterministic: the same seed always yields the same
 * corpus, so a diff in the report is a real change in behavior rather than
 * sampling noise. Nothing here uses production data.
 */

import { loopSemanticsFor } from '@claire/platform-catalog';
import type { ParticipantRef, SelfIdentity } from '../relevance';
import type { LoopScenario, ScenarioMessage } from './types';

export const SELF: SelfIdentity = {
  userId: '11111111-1111-1111-1111-111111111111',
  displayNames: ['luc', 'lucsucces'],
  handles: ['luc', 'lucsucces'],
  phones: ['166100494'],
  contactIds: ['15166100494'],
};

const SELF_MENTION = SELF.contactIds[0];

const CAST = ['Maya', 'Alex', 'Priya', 'Dana', 'Sam', 'Aunt Rita', 'Devon', 'Noah'];

function roster(names: string[]): ParticipantRef[] {
  return [
    ...names.map((displayName, i) => ({ identityKey: `p${i}`, displayName })),
    { identityKey: 'self', displayName: 'Luc', isSelf: true },
  ];
}

/**
 * Mulberry32. A seeded PRNG rather than Math.random so a report diff always
 * means the behavior changed, never that the sample did.
 */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(items: readonly T[], r: () => number): T {
  return items[Math.floor(r() * items.length)];
}

/** How a mention of the user renders on a given platform. */
function mentionToken(platform: string): string {
  switch (loopSemanticsFor(platform).mentionStyle) {
    // WhatsApp writes the phone number into the body, never the name.
    case 'phone':
      return '@15166100494';
    case 'display_name':
      return '@Luc';
    default:
      return '@luc';
  }
}

// ---------------------------------------------------------------------------
// Hand-authored corpus — the worked examples from the plan
// ---------------------------------------------------------------------------

export const HAND_AUTHORED: LoopScenario[] = [
  {
    id: 'dm-commitment-fulfilled',
    description: 'A commitment made and later fulfilled in a DM is one loop, and it closes',
    source: 'plan §2.1',
    platform: 'whatsapp',
    isGroup: false,
    sensitivity: 'normal',
    self: SELF,
    roster: roster(['Maya']),
    messages: [
      { ref: 'm1', from: 'Maya', text: 'Can you send me the Q3 deck before the board meeting?' },
      { ref: 'm2', from: 'You', text: "Yeah, I'll get it to you by Friday." },
      { ref: 'm3', from: 'You', text: 'Just sent it over', atMinute: 2880 },
      { ref: 'm4', from: 'Maya', text: 'Got it, thanks!', atMinute: 2881 },
    ],
    llmOwner: 'me',
    expect: { surfaced: true, signalsFire: ['dm'] },
    expectLoops: [
      {
        title: 'Send Maya the Q3 deck',
        kind: 'commitment',
        owner: 'me',
        evidence: ['m2'],
        resolvedBy: ['m3', 'm4'],
        deadlinePrecision: 'day',
      },
    ],
    pendingStage: 'extraction',
  },
  {
    id: 'dm-waiting-on-them',
    description: 'A DM where someone else owes the next move is still the user’s loop',
    source: 'plan §2.2',
    platform: 'telegram',
    isGroup: false,
    sensitivity: 'normal',
    self: SELF,
    roster: roster(['Alex']),
    messages: [
      { ref: 'm1', from: 'You', text: 'Can you review the contract and send me notes?' },
      { ref: 'm2', from: 'Alex', text: 'Sure, on it this week.' },
    ],
    llmOwner: 'them',
    llmOwnerName: 'Alex',
    expect: { surfaced: true },
    expectLoops: [
      { title: 'Alex to send contract notes', kind: 'request', owner: 'them', evidence: ['m2'] },
    ],
    pendingStage: 'extraction',
  },
  {
    id: 'group-not-addressed',
    description: 'A group commitment between two other people is not the user’s loop',
    source: 'plan §2.3 — the single biggest source of noise today',
    platform: 'whatsapp',
    isGroup: true,
    memberCount: 6,
    sensitivity: 'normal',
    self: SELF,
    roster: roster(['Aunt Rita', 'Sam']),
    messages: [
      { ref: 'm1', from: 'Aunt Rita', text: 'Sam, can you pick up the cake on Saturday?' },
      { ref: 'm2', from: 'Sam', text: 'Yep, I got it.' },
    ],
    llmOwner: 'them',
    llmOwnerName: 'Sam',
    expect: {
      surfaced: false,
      suppressedReason: 'named_other',
      signalsFire: ['named_other', 'no_self_signal'],
      signalsSilent: ['mention_exact', 'reply_to_me'],
    },
  },
  {
    id: 'group-mentioned-and-committed',
    description: 'Being named, then committing yourself, is an unambiguous loop',
    source: 'plan §2.4',
    platform: 'whatsapp',
    isGroup: true,
    memberCount: 6,
    sensitivity: 'normal',
    self: SELF,
    roster: roster(['Aunt Rita', 'Sam']),
    messages: [
      { ref: 'm1', from: 'Aunt Rita', text: '@15166100494 are you bringing the drinks?', mentions: [SELF_MENTION] },
      { ref: 'm2', from: 'You', text: "yeah I'll grab them Friday" },
    ],
    llmOwner: 'me',
    expect: { surfaced: true, signalsFire: ['self_commitment'] },
    expectLoops: [
      { title: 'Bring drinks on Saturday', kind: 'commitment', owner: 'me', evidence: ['m2'], deadlinePrecision: 'day' },
    ],
    pendingStage: 'extraction',
  },
  {
    id: 'group-reported-speech',
    description: 'Reported speech about a third party creates nothing',
    source: 'plan §2.6',
    platform: 'whatsapp',
    isGroup: true,
    memberCount: 8,
    sensitivity: 'normal',
    self: SELF,
    roster: roster(['Maya', 'Devon']),
    messages: [{ ref: 'm1', from: 'Maya', text: "She said she'd send it Friday" }],
    llmOwner: 'them',
    llmOwnerName: 'Devon',
    expect: { surfaced: false, signalsSilent: ['mention_exact', 'self_commitment'] },
  },
  {
    id: 'slack-broadcast-announcement',
    description: '@channel addresses everyone, so it addresses no one in particular',
    source: 'plan §11 — the failure mode that would reintroduce group noise at scale',
    platform: 'slack',
    isGroup: true,
    memberCount: 240,
    sensitivity: 'normal',
    self: SELF,
    roster: roster(['Dana', 'Devon']),
    messages: [
      { ref: 'm1', from: 'Dana', text: '@channel standup moved to 10 tomorrow', mentionsRoom: true },
    ],
    expect: {
      surfaced: false,
      signalsFire: ['broadcast_mention'],
      signalsSilent: ['mention_exact'],
    },
  },
  {
    id: 'slack-broadcast-plus-personal',
    description: 'A personal mention inside a broadcast still reaches the user',
    source: 'regression — audience size used to cancel out direct mentions',
    platform: 'slack',
    isGroup: true,
    memberCount: 240,
    sensitivity: 'normal',
    self: SELF,
    roster: roster(['Dana']),
    messages: [
      {
        ref: 'm1',
        from: 'Dana',
        text: '@here — @Luc can you own the migration doc?',
        mentions: [SELF_MENTION],
        mentionsRoom: true,
      },
    ],
    llmOwner: 'me',
    llmAddressed: true,
    expect: { surfaced: true, signalsFire: ['mention_exact'], signalsSilent: ['broadcast'] },
  },
  {
    id: 'slack-unclaimed-normal',
    description: 'Unassigned work in a Slack channel stays quiet at normal sensitivity',
    source: 'plan §2.7',
    platform: 'slack',
    isGroup: true,
    memberCount: 12,
    sensitivity: 'normal',
    self: SELF,
    roster: roster(['Dana', 'Devon']),
    messages: [
      { ref: 'm1', from: 'Dana', text: 'Someone needs to own the migration doc by Thursday.' },
    ],
    llmOwner: 'unknown',
    expect: { surfaced: false },
  },
  {
    id: 'slack-unclaimed-high',
    description: 'The same message surfaces once the user asks to watch the channel closely',
    source: 'plan §2.7 — this is what `high` is for',
    platform: 'slack',
    isGroup: true,
    memberCount: 12,
    sensitivity: 'high',
    self: SELF,
    roster: roster(['Dana', 'Devon']),
    messages: [
      { ref: 'm1', from: 'Dana', text: 'Someone needs to own the migration doc by Thursday.' },
    ],
    llmOwner: 'unknown',
    expect: { surfaced: true },
    expectLoops: [
      { title: 'Own the migration doc', kind: 'request', owner: 'unknown', evidence: ['m1'], deadlinePrecision: 'day' },
    ],
    pendingStage: 'extraction',
  },
  {
    id: 'group-sensitivity-off',
    description: 'sensitivity=off silences a conversation even when the user commits',
    source: 'plan §6 — the setting has to outrank every signal',
    platform: 'whatsapp',
    isGroup: true,
    memberCount: 5,
    sensitivity: 'off',
    self: SELF,
    roster: roster(['Maya']),
    messages: [{ ref: 'm1', from: 'You', text: "I'll send the notes tonight" }],
    llmOwner: 'me',
    expect: { surfaced: false, suppressedReason: 'sensitivity_off' },
  },
  {
    id: 'group-reply-to-user',
    description: 'A reply to something the user sent is addressed to them',
    source: 'plan §6 — the strongest signal, and one the old pipeline discarded',
    platform: 'whatsapp',
    isGroup: true,
    memberCount: 9,
    sensitivity: 'normal',
    self: SELF,
    roster: roster(['Maya', 'Devon']),
    messages: [
      { ref: 'm1', from: 'You', text: 'I put the launch doc in Drive' },
      { ref: 'm2', from: 'Devon', text: 'thanks — can you add the pricing table too?', replyTo: 'm1' },
    ],
    evidenceRefs: ['m2'],
    llmOwner: 'me',
    expect: { surfaced: true, signalsFire: ['reply_to_me'] },
  },
  {
    id: 'group-second-person-not-user',
    description: '"you" aimed at whoever spoke last is not aimed at the user',
    source: 'plan §6 — adjacency guard',
    platform: 'whatsapp',
    isGroup: true,
    memberCount: 7,
    sensitivity: 'normal',
    self: SELF,
    roster: roster(['Aunt Rita', 'Sam']),
    messages: [
      { ref: 'm1', from: 'Aunt Rita', text: 'Sam, can you pick up the cake?' },
      { ref: 'm2', from: 'Aunt Rita', text: 'and can you also get candles?' },
    ],
    evidenceRefs: ['m2'],
    llmOwner: 'them',
    llmOwnerName: 'Sam',
    expect: { surfaced: false, signalsSilent: ['second_person_after_self'] },
  },
  {
    id: 'group-watch-term',
    description: 'A watched term surfaces a message that would otherwise stay quiet',
    source: 'plan §6',
    platform: 'slack',
    isGroup: true,
    memberCount: 18,
    sensitivity: 'normal',
    self: SELF,
    roster: roster(['Dana', 'Devon']),
    watchTerms: ['billing migration'],
    messages: [
      { ref: 'm1', from: 'Dana', text: 'the billing migration needs a decision by Thursday' },
    ],
    llmOwner: 'unknown',
    expect: { surfaced: true, signalsFire: ['watch_term'] },
  },
  {
    id: 'large-channel-ambient',
    description: 'Ambient chatter in a large channel is not a loop',
    source: 'plan §11 — member_count, not sender count, decides this',
    platform: 'slack',
    isGroup: true,
    memberCount: 5000,
    sensitivity: 'normal',
    self: SELF,
    roster: roster(['Dana', 'Devon', 'Noah']),
    messages: [
      { ref: 'm1', from: 'Noah', text: 'we should probably document the deploy process at some point' },
    ],
    llmOwner: 'unknown',
    expect: { surfaced: false, signalsFire: ['broadcast'], signalsSilent: ['small_group'] },
  },
];


// ---------------------------------------------------------------------------
// Adversarial corpus — cases where signals conflict or the answer is arguable
//
// These exist to keep the eval honest. The templated corpus above measures
// breadth; this measures whether the scoring survives contact with messy
// language. Cases marked `knownLimitation` are ones deterministic scoring
// cannot be expected to resolve — they document the boundary where the model
// stage has to take over, and are reported without failing the build.
// ---------------------------------------------------------------------------

export const ADVERSARIAL: LoopScenario[] = [
  {
    id: 'adv-name-collision',
    description: 'Another participant shares the user\'s first name',
    source: 'adversarial — alias matching must not be naive',
    platform: 'slack',
    isGroup: true,
    memberCount: 14,
    sensitivity: 'normal',
    self: SELF,
    roster: [
      { identityKey: 'p0', displayName: 'Luc Bertrand' },
      { identityKey: 'p1', displayName: 'Dana' },
      { identityKey: 'self', displayName: 'Luc', isSelf: true },
    ],
    messages: [{ ref: 'm1', from: 'Dana', text: 'Luc Bertrand can you take the migration doc?' }],
    llmOwner: 'them',
    llmOwnerName: 'Luc Bertrand',
    expect: { surfaced: false },
    knownLimitation:
      'Two people share a first name. Scoring sees the alias and cannot tell them apart; ' +
      'disambiguation needs the roster-aware extraction stage.',
  },
  {
    id: 'adv-substring-name',
    description: 'A longer word containing the user\'s handle must not read as a mention',
    source: 'adversarial — token boundaries',
    platform: 'whatsapp',
    isGroup: true,
    memberCount: 8,
    sensitivity: 'normal',
    self: SELF,
    roster: roster(['Maya', 'Devon']),
    messages: [{ ref: 'm1', from: 'Maya', text: 'lucrative quarter — Devon can you write it up?' }],
    llmOwner: 'them',
    llmOwnerName: 'Devon',
    expect: { surfaced: false, signalsSilent: ['mention_exact'] },
  },
  {
    id: 'adv-quoted-commitment',
    description: 'A commitment quoted from someone else is not the quoter\'s commitment',
    source: 'adversarial — plan §2.6',
    platform: 'whatsapp',
    isGroup: true,
    memberCount: 6,
    sensitivity: 'normal',
    self: SELF,
    roster: roster(['Maya', 'Devon']),
    messages: [{ ref: 'm1', from: 'You', text: 'Devon said "I\'ll send the invoice Friday" — passing it on' }],
    llmOwner: 'them',
    llmOwnerName: 'Devon',
    expect: { surfaced: false },
    knownLimitation:
      'The user typed a first-person commitment inside a quotation. self_commitment is a ' +
      'hard pass on regex, so this surfaces. Distinguishing quoted from asserted speech ' +
      'requires the model.',
  },
  {
    id: 'adv-past-tense',
    description: 'Something already done is not an open loop',
    source: 'adversarial — plan §2.6',
    platform: 'telegram',
    isGroup: false,
    sensitivity: 'normal',
    self: SELF,
    roster: roster(['Alex']),
    messages: [{ ref: 'm1', from: 'You', text: 'I sent the contract on Friday' }],
    llmOwner: 'me',
    expect: { surfaced: false },
    knownLimitation:
      'DM is a hard pass, so relevance surfaces it by design. Tense is an extraction-stage ' +
      'judgement — relevance answers "is this yours", not "is this still open".',
  },
  {
    id: 'adv-mentioned-but-not-yours',
    description: 'Being mentioned in passing while the work is explicitly someone else\'s',
    source: 'adversarial — mention vs assignment',
    platform: 'slack',
    isGroup: true,
    memberCount: 20,
    sensitivity: 'normal',
    self: SELF,
    roster: roster(['Dana', 'Devon']),
    messages: [
      {
        ref: 'm1',
        from: 'Dana',
        text: '@Luc FYI — Devon is going to own the migration doc this week',
        mentions: [SELF_MENTION],
      },
    ],
    llmOwner: 'them',
    llmOwnerName: 'Devon',
    expect: { surfaced: false },
    knownLimitation:
      'mention_exact (+0.45) outweighs named_other (-0.55) only when the mention is absent. ' +
      'An FYI mention alongside someone else\'s assignment is genuinely ambiguous from ' +
      'signals alone; the extraction stage sets owner and settles it.',
  },
  {
    id: 'adv-reply-changes-subject',
    description: 'A reply to the user that is not about them',
    source: 'adversarial — reply adjacency is a proxy, not proof',
    platform: 'whatsapp',
    isGroup: true,
    memberCount: 10,
    sensitivity: 'normal',
    self: SELF,
    roster: roster(['Maya', 'Devon']),
    messages: [
      { ref: 'm1', from: 'You', text: 'the launch doc is in Drive' },
      { ref: 'm2', from: 'Maya', text: 'thanks! Devon, can you own the pricing table?', replyTo: 'm1' },
    ],
    evidenceRefs: ['m2'],
    llmOwner: 'them',
    llmOwnerName: 'Devon',
    expect: { surfaced: false },
    knownLimitation:
      'reply_to_me (+0.40) and named_other (-0.55) net out just under threshold here, but the ' +
      'margin is thin and depends on group size. Recorded so a weight change that flips it ' +
      'is visible.',
  },
  {
    id: 'adv-tiny-group-ambient',
    description: 'Ambient chatter in a 3-person group is still ambient',
    source: 'adversarial — small_group must not surface everything',
    platform: 'whatsapp',
    isGroup: true,
    memberCount: 3,
    sensitivity: 'normal',
    self: SELF,
    roster: roster(['Maya', 'Devon']),
    messages: [{ ref: 'm1', from: 'Maya', text: 'that restaurant was great last night' }],
    llmOwner: 'unknown',
    expect: { surfaced: false, signalsFire: ['small_group', 'no_self_signal'] },
  },
  {
    id: 'adv-joke-commitment',
    description: 'A joke in first person is not a commitment',
    source: 'adversarial — plan §2.6',
    platform: 'whatsapp',
    isGroup: true,
    memberCount: 6,
    sensitivity: 'normal',
    self: SELF,
    roster: roster(['Maya']),
    messages: [{ ref: 'm1', from: 'You', text: "I'll fly to the moon tomorrow lol" }],
    llmOwner: 'me',
    expect: { surfaced: false },
    knownLimitation:
      'Regex cannot read tone. self_commitment fires on the first-person form; plausibility ' +
      'is an extraction-stage judgement.',
  },
  {
    id: 'adv-second-person-plural',
    description: 'A question to the whole group is not a question to the user',
    source: 'adversarial — "you" is ambiguous in groups',
    platform: 'slack',
    isGroup: true,
    memberCount: 30,
    sensitivity: 'normal',
    self: SELF,
    roster: roster(['Dana', 'Devon']),
    messages: [
      { ref: 'm1', from: 'You', text: 'deploy is green' },
      { ref: 'm2', from: 'Dana', text: 'can you all review the runbook before Friday?' },
    ],
    evidenceRefs: ['m2'],
    llmOwner: 'unknown',
    // Correctly suppressed, but note *why*: second_person_after_self does fire
    // (the scorer cannot tell "you all" from "you"), and it is the large-channel
    // penalty that carries the result. In a small channel this would surface.
    // Pinned here so a weight change that removes the safety net is visible.
    expect: { surfaced: false, signalsFire: ['second_person_after_self', 'broadcast'] },
  },
];

// ---------------------------------------------------------------------------
// Generated corpus — vary one axis at a time
// ---------------------------------------------------------------------------

const COMMITMENT_TEMPLATES = [
  "I'll send you the {thing} by {when}",
  "I'll take care of the {thing} before {when}",
  'let me put together the {thing} for {when}',
];

const REQUEST_TEMPLATES = [
  'can you send the {thing} by {when}?',
  'could you own the {thing} before {when}?',
  'would you mind pulling together the {thing} for {when}?',
];

const AMBIENT_TEMPLATES = [
  'the weather looks rough this week',
  'that new release is pretty good',
  'anyone else seeing the flaky test on CI?',
  'lunch spot recommendations near the office?',
];

const THINGS = ['deck', 'contract', 'budget', 'launch plan', 'migration doc', 'invoice'];
const WHENS = ['Friday', 'Thursday', 'end of week', 'tomorrow', 'Monday'];

function fill(template: string, r: () => number): string {
  return template.replace('{thing}', pick(THINGS, r)).replace('{when}', pick(WHENS, r));
}

export interface GenerateOptions {
  seed?: number;
  /** Scenarios per (platform × shape) combination. */
  perCombination?: number;
  platforms?: string[];
}

/**
 * Build a corpus that varies platform, audience size, and how the user is
 * addressed. Ground truth is derived from *how the scenario was constructed*,
 * not from running the scorer — otherwise the eval would only ever confirm
 * whatever the code currently does.
 */
export function generateScenarios(options: GenerateOptions = {}): LoopScenario[] {
  const { seed = 42, perCombination = 2, platforms = ['whatsapp', 'telegram', 'slack', 'instagram'] } = options;
  const r = rng(seed);
  const scenarios: LoopScenario[] = [];

  type Shape =
    | 'dm_self_commitment'
    | 'dm_request_to_user'
    | 'group_mentions_user'
    | 'group_names_other'
    | 'group_ambient'
    | 'group_broadcast';

  const shapes: Shape[] = [
    'dm_self_commitment',
    'dm_request_to_user',
    'group_mentions_user',
    'group_names_other',
    'group_ambient',
    'group_broadcast',
  ];

  for (const platform of platforms) {
    const semantics = loopSemanticsFor(platform);
    for (const shape of shapes) {
      // Only platforms with broadcast syntax can produce that shape.
      if (shape === 'group_broadcast' && semantics.broadcastMentions.length === 0) continue;

      for (let n = 0; n < perCombination; n += 1) {
        const id = `gen-${platform}-${shape}-${n}`;
        const other = pick(CAST, r);
        const third = pick(CAST.filter((c) => c !== other), r);
        const isGroup = shape.startsWith('group');
        const memberCount = isGroup ? Math.floor(r() * 40) + 3 : undefined;
        const messages: ScenarioMessage[] = [];
        let expectSurfaced: boolean;
        let llmOwner: LoopScenario['llmOwner'];
        let llmOwnerName: string | null = null;
        const signalsFire: string[] = [];
        const signalsSilent: string[] = [];

        switch (shape) {
          case 'dm_self_commitment':
            messages.push(
              { ref: 'm1', from: other, text: fill(pick(REQUEST_TEMPLATES, r), r) },
              { ref: 'm2', from: 'You', text: fill(pick(COMMITMENT_TEMPLATES, r), r) },
            );
            expectSurfaced = true;
            llmOwner = 'me';
            signalsFire.push('dm');
            break;

          case 'dm_request_to_user':
            messages.push({ ref: 'm1', from: other, text: fill(pick(REQUEST_TEMPLATES, r), r) });
            expectSurfaced = true;
            llmOwner = 'me';
            signalsFire.push('dm');
            break;

          case 'group_mentions_user':
            messages.push({
              ref: 'm1',
              from: other,
              text: `${mentionToken(platform)} ${fill(pick(REQUEST_TEMPLATES, r), r)}`,
              mentions: [SELF_MENTION],
            });
            expectSurfaced = true;
            llmOwner = 'me';
            signalsFire.push('mention_exact');
            break;

          case 'group_names_other':
            messages.push(
              { ref: 'm1', from: other, text: `${third}, ${fill(pick(REQUEST_TEMPLATES, r), r)}` },
              { ref: 'm2', from: third, text: 'yep, on it' },
            );
            expectSurfaced = false;
            llmOwner = 'them';
            llmOwnerName = third;
            signalsFire.push('named_other');
            signalsSilent.push('mention_exact');
            break;

          case 'group_ambient':
            messages.push({ ref: 'm1', from: other, text: pick(AMBIENT_TEMPLATES, r) });
            expectSurfaced = false;
            llmOwner = 'unknown';
            signalsFire.push('no_self_signal');
            break;

          case 'group_broadcast':
            messages.push({
              ref: 'm1',
              from: other,
              text: `${semantics.broadcastMentions[0]} ${pick(AMBIENT_TEMPLATES, r)}`,
              mentionsRoom: true,
            });
            expectSurfaced = false;
            llmOwner = 'unknown';
            signalsFire.push('broadcast_mention');
            signalsSilent.push('mention_exact');
            break;
        }

        scenarios.push({
          id,
          description: `generated: ${shape.replace(/_/g, ' ')} on ${platform}`,
          source: `generator seed ${seed}`,
          platform,
          isGroup,
          memberCount,
          sensitivity: 'normal',
          self: SELF,
          roster: roster([other, third]),
          messages,
          llmOwner,
          llmOwnerName,
          expect: { surfaced: expectSurfaced, signalsFire, signalsSilent },
        });
      }
    }
  }

  return scenarios;
}

/** Hand-authored plus generated, which is what CI runs. */
export function fullCorpus(options: GenerateOptions = {}): LoopScenario[] {
  return [...HAND_AUTHORED, ...ADVERSARIAL, ...generateScenarios(options)];
}
