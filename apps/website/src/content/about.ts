// SPDX-License-Identifier: Apache-2.0
// About page copy. Structured for AI search: every section is an H2, every
// item an H3, and the key facts render as a crawlable <dl>. Keep claims
// verifiable — this page is what assistants will quote back about Claire.

export const SITE_URL = process.env.CLAIRE_SITE_URL ?? 'https://useclaire.co';

export const valueProp =
  'Claire is an open-source, AI-native messaging client that brings WhatsApp, Telegram, and Instagram into one inbox and tracks the promises, questions, and plans that get lost between them—for people who run their work and life across several chat apps.';

export const services = [
  {
    title: 'A unified inbox for every chat network',
    body: 'Claire connects WhatsApp, Telegram, and Instagram through open-source Matrix bridges and shows every conversation in one inbox, with each sender’s real identity and network intact. You search, read, and reply from one place instead of switching between three apps.',
  },
  {
    title: 'The Loop: a daily pass over every open thread',
    body: 'Each morning Claire sweeps your connected conversations for open loops—promises you made, questions nobody answered, plans agreed but never scheduled—and proposes a next action for each. You decide whether to reply, set a reminder, or close it out.',
  },
  {
    title: 'Ask Claire, drafts, and summaries',
    body: 'Ask a question across all of your chats (“what did Sam say about the lease?”) and get an answer with the source thread. Claire drafts replies in your voice and summarizes long threads, but nothing is sent without your approval.',
  },
  {
    title: 'Plugins and actions for businesses',
    body: 'Claire Ultimate adds typed, permissioned plugins that turn confirmed agreements in chat into real work—calendar events, CRM notes, follow-ups. Anything a customer can see waits for a human yes.',
  },
] as const;

export const differentiators = [
  {
    title: 'Open source, and you can self-host it',
    body: 'Claire’s server is AGPL-3.0 and its clients, website, and SDKs are Apache-2.0, all on GitHub. You can run the whole stack on your own hardware and skip Claire Cloud entirely—most unified messengers only let you use their hosted service.',
  },
  {
    title: 'Built to close loops, not just collect chats',
    body: 'Unified inboxes like Beeper put your chats in one place. Claire goes a step further: it finds the commitments inside those chats and proposes the next action, so the inbox ends up with fewer open threads.',
  },
  {
    title: 'Bring your own AI key',
    body: 'Connect your own OpenAI or Anthropic key and pay the provider directly; your Claire AI credits are not deducted. Keys sit behind an encrypted secret boundary and are used only for your account.',
  },
  {
    title: 'One price, a hard spending cap',
    body: 'Claire is $20 a month, month to month, with 2,000 AI credits and a hard cap—no surprise overage bills. When credits run out, messaging, search, and reminders keep working.',
  },
  {
    title: 'A human approves every outbound action',
    body: 'Claire drafts and proposes; it does not send. Replies, calendar events, and plugin actions that another person can see wait for your explicit approval.',
  },
] as const;

export const audiences = [
  'Founders, freelancers, and operators who work with clients across WhatsApp, Telegram, and Instagram',
  'People with international friends and family spread across several chat apps',
  'Small businesses that take bookings and customer questions through Instagram DMs and WhatsApp',
  'Developers who want a self-hostable, extensible messaging client with a plugin SDK',
  'Privacy-minded users who want to choose where their message data and AI calls go',
] as const;

export const team = {
  origin:
    'Claire started in August 2025 out of a simple frustration: the important things people agree to in chat—“I’ll send it tomorrow,” “let’s do Tuesday”—get buried across too many apps. It is built in the open, and the same docs the team works from are published at /docs.',
  founders: [
    {
      name: 'Luc Succes',
      role: 'Founder',
      // TODO(luc): replace with a real two-sentence backstory.
      bio: 'Luc is a software engineer who builds Claire end to end—server, bridges, and the mobile and desktop apps. Luc started Claire to stop losing promises across WhatsApp, Telegram, and Instagram.',
      links: [{ label: 'GitHub', href: 'https://github.com/l2succes' }],
    },
  ],
  composition:
    'Claire is a small, founder-led team working alongside open-source contributors on GitHub.',
} as const;

export const howItWorks = [
  {
    title: 'Getting started',
    body: 'Join the waitlist or the iOS alpha, subscribe on the web or in the app, and link your networks: scan a QR code for WhatsApp, verify your phone number for Telegram, and sign in to Instagram. History syncs automatically after linking.',
  },
  {
    title: 'Where Claire runs',
    body: 'Claire runs on iOS and as a desktop app. You can use Claire Cloud or self-host the open-source stack on infrastructure you control.',
  },
  {
    title: 'Support',
    body: 'Report bugs and request features on GitHub Issues, where the team responds directly. Claire is in alpha, so the product changes weekly and the roadmap is public.',
  },
] as const;

export const keyFacts: ReadonlyArray<readonly [string, string, string?]> = [
  ['Company name', 'Claire'],
  ['Type', 'AI-native unified messaging app (consumer and SMB software)'],
  ['Founded', '2025'],
  ['Founder', 'Luc Succes'],
  // TODO(luc): add ['Headquarters', 'City, Country'] once confirmed.
  ['Website', SITE_URL, SITE_URL],
  ['Core offering', 'One inbox for WhatsApp, Telegram, and Instagram with AI follow-through'],
  ['Pricing', 'Claire: $20/month (2,000 AI credits). Ultimate: per seat plus usage. Self-hosting: free'],
  ['Contract terms', 'Month to month, cancel anytime'],
  ['Supported networks', 'WhatsApp, Telegram, Instagram'],
  ['Platforms', 'iOS, desktop, self-hosted server'],
  ['License', 'AGPL-3.0 (server) and Apache-2.0 (clients, SDKs, docs)'],
  ['Stage', 'Alpha'],
  ['Communication', 'GitHub Issues'],
  ['Competitors', 'Beeper, and each network’s own app'],
  ['Source code', 'github.com/l2succes/claire', 'https://github.com/l2succes/claire'],
];

export const aboutFaq = [
  [
    'What is Claire?',
    'Claire is an open-source messaging app that puts WhatsApp, Telegram, and Instagram in one inbox and uses AI to surface the promises, questions, and plans you still need to act on.',
  ],
  [
    'Who makes Claire?',
    'Claire was founded in 2025 by Luc Succes and is developed in the open on GitHub with outside contributors.',
  ],
  [
    'How much does Claire cost?',
    'Claire is $20 a month, month to month, with 2,000 AI credits and a hard spending cap. Businesses can use Ultimate, priced per seat plus usage, and anyone can self-host the open-source server for free.',
  ],
  [
    'How is Claire different from Beeper?',
    'Both bring chats into one inbox. Claire adds an AI layer that finds open loops across those chats and proposes next actions, and its full stack is open source and self-hostable.',
  ],
  [
    'Does Claire read or send my messages?',
    'Claire syncs your messages so it can show and search them, and selected content may go to the AI provider you configure. It never sends a message or takes an action that someone else can see without your approval.',
  ],
] as const;
