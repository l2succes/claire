'use client';

// SPDX-License-Identifier: Apache-2.0
import { useGSAP } from '@gsap/react';
import {
  ArrowPathIcon,
  ArrowUpIcon,
  CalendarDaysIcon,
  ChatBubbleLeftRightIcon,
  CheckCircleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  FilmIcon,
  LockClosedIcon,
  MagnifyingGlassIcon,
  MapPinIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  SparklesIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline';
import gsap from 'gsap';
import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import styles from './ask-claire-demo.module.css';

gsap.registerPlugin(useGSAP);

type DemoFormat = 'landscape' | 'square' | 'mobile';

type DemoScene = {
  id: 'russian' | 'saturday' | 'birthday';
  label: string;
  shortLabel: string;
  question: string;
  eyebrow: string;
  answer: string;
  detail: string;
  resultLabel: string;
  resultValue: string;
  resultMeta: string;
  relationship: string;
  followUpQuestion: string;
  followUpAnswer: string;
  followUpAction: string;
  sources: Array<{
    initials: string;
    name: string;
    platform: string;
    time: string;
    excerpt: string;
    tone: 'lime' | 'blush' | 'lavender';
  }>;
  actions: string[];
};

const DEMO_SCENES: DemoScene[] = [
  {
    id: 'russian',
    label: 'Find a person',
    shortLabel: 'Person',
    question: "Who's the Russian girl I was talking about in the past couple of days?",
    eyebrow: 'LIKELY MATCH',
    answer: 'You were probably thinking of Anya Petrova.',
    detail:
      'You mentioned meeting her at Casa Franca, then Sofia sent you her Telegram the next morning. She moved to Mexico City from Saint Petersburg last year.',
    resultLabel: 'Anya Petrova',
    resultValue: 'Mexico City',
    resultMeta: 'Introduced by Sofia · 2 days ago',
    relationship: 'New connection · 2 mutual friends',
    followUpQuestion: 'That’s her. Where did Sofia send me her contact?',
    followUpAnswer:
      'In WhatsApp on Monday night. Sofia shared Anya’s Telegram username right after you left Casa Franca.',
    followUpAction: 'Open Sofia’s message',
    sources: [
      {
        initials: 'SO',
        name: 'Sofia Ortega',
        platform: 'WhatsApp',
        time: 'MON · 10:42 PM',
        excerpt: 'Anya is the Russian girl I introduced you to at Casa Franca.',
        tone: 'blush',
      },
      {
        initials: 'AP',
        name: 'Anya Petrova',
        platform: 'Telegram',
        time: 'TUE · 11:18 AM',
        excerpt: 'So nice meeting you! I moved here from Saint Petersburg last year.',
        tone: 'lavender',
      },
    ],
    actions: ['Open Anya’s chat', 'Show introduction'],
  },
  {
    id: 'saturday',
    label: 'Remember plans',
    shortLabel: 'Plans',
    question: "I think I made plans on Saturday, but I don't remember with whom.",
    eyebrow: 'SATURDAY PLAN FOUND',
    answer: 'Dinner with Mateo and Camila at 8:00 PM.',
    detail:
      'Mateo suggested Contramar and you said Saturday worked. Camila confirmed she would book a table for three and send the reservation.',
    resultLabel: 'Dinner at Contramar',
    resultValue: 'Saturday · 8:00 PM',
    resultMeta: 'Mateo Ruiz + Camila Torres',
    relationship: 'Plan confirmed across 2 conversations',
    followUpQuestion: 'Perfect. Did anyone make the reservation?',
    followUpAnswer:
      'Camila said she would book a table for three. I haven’t found a confirmation or reservation number yet.',
    followUpAction: 'Ask Camila',
    sources: [
      {
        initials: 'MR',
        name: 'Mateo Ruiz',
        platform: 'WhatsApp',
        time: 'YESTERDAY · 4:06 PM',
        excerpt: 'Contramar Saturday? Let’s say 8 so Camila can make it too.',
        tone: 'lime',
      },
      {
        initials: 'CT',
        name: 'Camila Torres',
        platform: 'Instagram',
        time: 'YESTERDAY · 4:31 PM',
        excerpt: 'Perfect. I’ll book for three and send you both the reservation.',
        tone: 'blush',
      },
    ],
    actions: ['Add to calendar', 'Open group chat'],
  },
  {
    id: 'birthday',
    label: 'Plan a birthday',
    shortLabel: 'Birthday',
    question: 'Help me plan my birthday. Who are my closest people in Mexico City and Brooklyn?',
    eyebrow: 'YOUR CLOSE CIRCLE',
    answer: 'I found 8 people you talk to most across both cities.',
    detail:
      'Five are currently in Mexico City and three are still based in Brooklyn. This is ranked by recent conversation frequency, mutual plans, and relationship history.',
    resultLabel: '8 close connections',
    resultValue: 'CDMX 5 · Brooklyn 3',
    resultMeta: 'Based on the last 90 days',
    relationship: '32 conversations · 14 shared plans',
    followUpQuestion: 'Great. Start with the Mexico City group.',
    followUpAnswer:
      'I’ve prepared a five-person shortlist: Sofia, Mateo, Camila, Diego, and Valeria. You spoke with each of them this week.',
    followUpAction: 'Review invite list',
    sources: [
      {
        initials: 'SO',
        name: 'Sofia, Mateo + 3',
        platform: 'Mexico City',
        time: '5 PEOPLE',
        excerpt: 'Your most frequent local conversations and recent in-person plans.',
        tone: 'lime',
      },
      {
        initials: 'NK',
        name: 'Noah, Maya + 1',
        platform: 'Brooklyn',
        time: '3 PEOPLE',
        excerpt: 'Still based in Brooklyn, with active conversations in the past month.',
        tone: 'lavender',
      },
    ],
    actions: ['Create invite list', 'Draft a group message'],
  },
];

const SOURCE_TONE_CLASS = {
  lime: styles.sourceAvatarLime,
  blush: styles.sourceAvatarBlush,
  lavender: styles.sourceAvatarLavender,
} as const;

function words(value: string) {
  return value.split(' ').map((word, index) => (
    <span className={styles.revealWord} key={`${word}-${index}`}>
      {word}{' '}
    </span>
  ));
}

function Mark({ compact = false }: { compact?: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className={compact ? styles.markCompact : styles.mark}
      viewBox="0 0 64 64"
    >
      <g transform="translate(64 0) scale(-1 1)">
        <path
          d="M10 34c0-13 9-22 22-22s22 8 22 20-9 20-21 20c-10 0-17-6-17-14 0-7 5-12 12-12 6 0 10 4 10 9 0 6-4 10-10 10"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="7"
        />
        <circle cx="10" cy="34" fill="var(--mark-dot, #dfff64)" r="4" />
      </g>
    </svg>
  );
}

function PlatformGlyph({ platform }: { platform: string }) {
  const slug =
    platform === 'WhatsApp'
      ? 'whatsapp'
      : platform === 'Telegram'
        ? 'telegram'
        : platform === 'Instagram'
          ? 'instagram'
          : null;
  const toneClass =
    platform === 'WhatsApp'
      ? styles.platformWhatsApp
      : platform === 'Telegram'
        ? styles.platformTelegram
        : platform === 'Instagram'
          ? styles.platformInstagram
          : styles.platformLocation;
  return (
    <span className={`${styles.platformGlyph} ${toneClass}`}>
      {slug ? (
        <Image alt="" height={12} src={`/assets/platforms/${slug}.svg`} width={12} />
      ) : (
        <MapPinIcon aria-hidden="true" />
      )}
    </span>
  );
}

function MobileAskClaireScene({ scene }: { scene: DemoScene }) {
  return (
    <div className={styles.mobileDevice} data-app-frame>
      <div className={styles.mobileCanvas}>
        <div className={styles.mobileViewport}>
          <div className={styles.mobileIsland} aria-hidden="true" />
          <div className={styles.mobileStatus} aria-hidden="true">
            <span>9:41</span>
            <span className={styles.mobileStatusIcons}>
              <i />
              <i />
              <i />
            </span>
          </div>

          <section className={styles.mobileScreen}>
            <header className={styles.mobileHeader}>
              <button aria-label="Back" type="button">
                <ChevronLeftIcon />
              </button>
              <div>
                <h1>Ask Claire</h1>
                <p>Across your connected conversations</p>
              </div>
              <span className={styles.mobileHeaderMark}>
                <Mark compact />
              </span>
            </header>

            <div className={styles.mobileConversationBody}>
              <div className={styles.mobileThreadTrack} data-thread-track>
                <div
                  className={styles.mobileQuestion}
                  data-query-bubble
                  aria-label={scene.question}
                >
                  {scene.question.split('').map((character, index) => (
                    <span aria-hidden="true" data-query-character key={`${character}-${index}`}>
                      {character === ' ' ? '\u00A0' : character}
                    </span>
                  ))}
                </div>

                <div className={styles.mobileThinkingCard} data-thinking-card>
                  <div className={styles.mobileThinkingHeader}>
                    <Mark compact />
                    <span>Claire is connecting the dots</span>
                    <span className={styles.thinkingDots}>
                      <i data-thinking-dot />
                      <i data-thinking-dot />
                      <i data-thinking-dot />
                    </span>
                  </div>
                  <div className={styles.mobileThinkingSteps}>
                    <span data-thinking-row>
                      <MagnifyingGlassIcon /> Reading relevant conversations
                    </span>
                    <span data-thinking-row>
                      <UserGroupIcon /> Connecting people, places, and plans
                    </span>
                  </div>
                </div>

                <article className={styles.mobileAnswerCard} data-answer-card>
                  <span className={styles.answerEyebrow}>{scene.eyebrow}</span>
                  <h2>{words(scene.answer)}</h2>
                  <p>{words(scene.detail)}</p>
                  <div className={styles.mobileSourceStack} data-source-stack>
                    <span className={styles.miniAvatars}>
                      {scene.sources.map((source) => (
                        <span className={SOURCE_TONE_CLASS[source.tone]} key={source.name}>
                          {source.initials}
                        </span>
                      ))}
                    </span>
                    <span>{scene.sources.length} source conversations</span>
                    <ChevronRightIcon />
                  </div>
                  <div className={styles.mobileAnswerActions}>
                    {scene.actions.map((action, index) => (
                      <button
                        className={
                          index === 0 ? styles.mobilePrimaryAction : styles.mobileSecondaryAction
                        }
                        data-action-button
                        key={action}
                        type="button"
                      >
                        {index === 0 && scene.id === 'saturday' ? <CalendarDaysIcon /> : null}
                        {index === 0 && scene.id === 'birthday' ? <UserGroupIcon /> : null}
                        {index === 0 && scene.id === 'russian' ? <ChatBubbleLeftRightIcon /> : null}
                        {action}
                      </button>
                    ))}
                  </div>
                </article>

                <div className={styles.mobileFollowUpExchange} data-follow-up-exchange>
                  <div
                    aria-label={scene.followUpQuestion}
                    className={styles.mobileFollowUpQuestion}
                    data-follow-up-bubble
                  >
                    {scene.followUpQuestion.split('').map((character, index) => (
                      <span
                        aria-hidden="true"
                        data-follow-up-character
                        key={`${character}-${index}`}
                      >
                        {character === ' ' ? '\u00A0' : character}
                      </span>
                    ))}
                  </div>
                  <div className={styles.mobileFollowUpThinking} data-follow-up-thinking>
                    <Mark compact />
                    <span>Checking the conversation</span>
                    <span className={styles.thinkingDots}>
                      <i data-follow-up-thinking-dot />
                      <i data-follow-up-thinking-dot />
                      <i data-follow-up-thinking-dot />
                    </span>
                  </div>
                  <article className={styles.mobileFollowUpAnswer} data-follow-up-answer>
                    <span className={styles.mobileAnswerMark}>
                      <Mark compact />
                    </span>
                    <div>
                      <span className={styles.answerEyebrow}>FOLLOW-UP</span>
                      <p>
                        {scene.followUpAnswer.split(' ').map((word, index) => (
                          <span
                            className={styles.revealWord}
                            data-follow-up-word
                            key={`${word}-${index}`}
                          >
                            {word}{' '}
                          </span>
                        ))}
                      </p>
                      <button data-follow-up-action type="button">
                        <ChatBubbleLeftRightIcon />
                        {scene.followUpAction}
                        <ChevronRightIcon />
                      </button>
                    </div>
                  </article>
                </div>
              </div>
            </div>

            <footer className={styles.mobileComposer}>
              <button aria-label="Add context" type="button">
                <PlusIcon />
              </button>
              <span>
                Ask about your conversations
                <i className={styles.mobileComposerCaret} data-composer-caret />
              </span>
              <button
                aria-label="Send question"
                className={styles.mobileSendButton}
                data-send-button
                type="button"
              >
                <ArrowUpIcon />
              </button>
            </footer>
          </section>
        </div>
      </div>
    </div>
  );
}

type AskClaireDemoProps = {
  initialAutoplay: boolean;
  initialChrome: boolean;
  initialFormat?: string;
  initialLoop: boolean;
  initialScene?: string;
};

function initialSceneIndex(id?: string) {
  const index = DEMO_SCENES.findIndex((item) => item.id === id);
  return index >= 0 ? index : 0;
}

function initialDemoFormat(value?: string): DemoFormat {
  if (value === 'mobile' || value === 'portrait') return 'mobile';
  return value === 'square' ? value : 'landscape';
}

export function AskClaireDemo({
  initialAutoplay,
  initialChrome,
  initialFormat,
  initialLoop,
  initialScene,
}: AskClaireDemoProps) {
  const rootRef = useRef<HTMLElement>(null);
  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  const [sceneIndex, setSceneIndex] = useState(() => initialSceneIndex(initialScene));
  const [runId, setRunId] = useState(0);
  const [playing, setPlaying] = useState(initialAutoplay);
  const [loop, setLoop] = useState(initialLoop);
  const showChrome = initialChrome;
  const [format, setFormat] = useState<DemoFormat>(() => initialDemoFormat(initialFormat));
  const scene = DEMO_SCENES[sceneIndex];

  const goToScene = useCallback((index: number) => {
    setSceneIndex((index + DEMO_SCENES.length) % DEMO_SCENES.length);
    setPlaying(true);
    setRunId((current) => current + 1);
  }, []);

  useGSAP(
    () => {
      const root = rootRef.current;
      if (!root) return;

      const queryCharacters = root.querySelectorAll('[data-query-character]');
      const thinkingRows = root.querySelectorAll('[data-thinking-row]');
      const sourceCards = root.querySelectorAll('[data-source-card]');
      const answerWords = root.querySelectorAll(`[data-answer-card] .${styles.revealWord}`);
      const actionButtons = root.querySelectorAll('[data-action-button]');
      const followUpCharacters = root.querySelectorAll('[data-follow-up-character]');
      const followUpWords = root.querySelectorAll('[data-follow-up-word]');
      const progressFill = root.querySelector('[data-progress-fill]');
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      gsap.set('[data-app-frame]', { autoAlpha: 1 });
      gsap.set('[data-query-bubble]', { autoAlpha: 0, y: 18, scale: 0.985 });
      gsap.set(queryCharacters, { autoAlpha: 0, y: 5 });
      gsap.set('[data-thinking-card]', { autoAlpha: 0, y: 15 });
      gsap.set(thinkingRows, { autoAlpha: 0, x: -8 });
      gsap.set(sourceCards, { autoAlpha: 0, x: 22, rotate: 0.8 });
      gsap.set('[data-result-card]', { autoAlpha: 0, y: 18, scale: 0.98 });
      gsap.set('[data-answer-card]', { autoAlpha: 0, y: 20 });
      gsap.set(answerWords, { autoAlpha: 0, y: 8 });
      gsap.set(actionButtons, { autoAlpha: 0, y: 10 });
      gsap.set('[data-source-stack]', { autoAlpha: 0, y: 8 });
      gsap.set('[data-follow-up-bubble]', { autoAlpha: 0, y: 16, scale: 0.985 });
      gsap.set(followUpCharacters, { autoAlpha: 0, y: 4 });
      gsap.set('[data-follow-up-thinking]', { autoAlpha: 0, y: 10 });
      gsap.set('[data-follow-up-answer]', { autoAlpha: 0, y: 18 });
      gsap.set(followUpWords, { autoAlpha: 0, y: 7 });
      gsap.set('[data-follow-up-action]', { autoAlpha: 0, y: 8 });
      gsap.set(progressFill, { scaleX: 0, transformOrigin: 'left center' });

      if (reducedMotion) {
        gsap.set(
          [
            '[data-query-bubble]',
            queryCharacters,
            '[data-thinking-card]',
            thinkingRows,
            sourceCards,
            '[data-result-card]',
            '[data-answer-card]',
            answerWords,
            actionButtons,
            '[data-source-stack]',
            '[data-follow-up-bubble]',
            followUpCharacters,
            '[data-follow-up-thinking]',
            '[data-follow-up-answer]',
            followUpWords,
            '[data-follow-up-action]',
          ],
          { autoAlpha: 1, x: 0, y: 0, scale: 1, rotate: 0 }
        );
        gsap.set(progressFill, { scaleX: 1 });
        return;
      }

      const timeline = gsap.timeline({
        paused: !playing,
        defaults: { ease: 'power3.out' },
        onUpdate: () => gsap.set(progressFill, { scaleX: timeline.progress() }),
        onComplete: () => {
          if (loop) {
            goToScene(sceneIndex + 1);
          } else {
            setPlaying(false);
          }
        },
      });

      timelineRef.current = timeline;
      timeline
        .fromTo('[data-app-frame]', { y: 10, scale: 0.992 }, { y: 0, scale: 1, duration: 0.65 })
        .to('[data-query-bubble]', { autoAlpha: 1, y: 0, scale: 1, duration: 0.42 }, 0.18)
        .to(
          queryCharacters,
          { autoAlpha: 1, y: 0, duration: 0.025, stagger: 0.018, ease: 'none' },
          0.48
        )
        .to('[data-send-button]', { scale: 0.88, duration: 0.1, ease: 'power2.in' }, '>-0.04')
        .to('[data-send-button]', { scale: 1, duration: 0.22, ease: 'back.out(2)' })
        .to('[data-composer-caret]', { autoAlpha: 0, duration: 0.12 }, '<')
        .to('[data-thinking-card]', { autoAlpha: 1, y: 0, duration: 0.4 }, '>-0.02')
        .to(thinkingRows, { autoAlpha: 1, x: 0, duration: 0.3, stagger: 0.42 }, '<0.08')
        .to(
          '[data-thinking-dot]',
          { scale: 1.35, duration: 0.32, stagger: 0.12, yoyo: true, repeat: 3 },
          '<0.12'
        )
        .to(sourceCards, { autoAlpha: 1, x: 0, rotate: 0, duration: 0.48, stagger: 0.18 }, '<0.52')
        .to('[data-thinking-card]', { autoAlpha: 0, y: -9, duration: 0.28 }, '>-0.04')
        .to('[data-result-card]', { autoAlpha: 1, y: 0, scale: 1, duration: 0.48 }, '<0.02')
        .to('[data-answer-card]', { autoAlpha: 1, y: 0, duration: 0.48 }, '<0.12')
        .to(answerWords, { autoAlpha: 1, y: 0, duration: 0.26, stagger: 0.045 }, '<0.18')
        .to('[data-source-stack]', { autoAlpha: 1, y: 0, duration: 0.36 }, '>-0.05')
        .to(actionButtons, { autoAlpha: 1, y: 0, duration: 0.35, stagger: 0.1 }, '<0.08')
        .to({}, { duration: 3.8 })
        .to('[data-thread-track]', {
          y: (_index, target) => {
            const followUp = target.querySelector('[data-follow-up-exchange]');
            return followUp instanceof HTMLElement ? -Math.max(0, followUp.offsetTop - 24) : -280;
          },
          duration: 0.9,
          ease: 'power3.inOut',
        })
        .to('[data-follow-up-bubble]', { autoAlpha: 1, y: 0, scale: 1, duration: 0.4 }, '<0.12')
        .to(
          followUpCharacters,
          { autoAlpha: 1, y: 0, duration: 0.025, stagger: 0.018, ease: 'none' },
          '<0.14'
        )
        .to('[data-follow-up-thinking]', { autoAlpha: 1, y: 0, duration: 0.34 }, '>-0.02')
        .to(
          '[data-follow-up-thinking-dot]',
          { scale: 1.35, duration: 0.28, stagger: 0.1, yoyo: true, repeat: 3 },
          '<0.08'
        )
        .to('[data-follow-up-thinking]', { autoAlpha: 0, y: -7, duration: 0.24 })
        .to('[data-follow-up-answer]', { autoAlpha: 1, y: 0, duration: 0.45 }, '<0.05')
        .to(followUpWords, { autoAlpha: 1, y: 0, duration: 0.24, stagger: 0.05 }, '<0.16')
        .to('[data-follow-up-action]', { autoAlpha: 1, y: 0, duration: 0.34 }, '>-0.02')
        .to({}, { duration: 8 });

      return () => {
        timelineRef.current = null;
      };
    },
    { scope: rootRef, dependencies: [sceneIndex, runId, loop, goToScene] }
  );

  useEffect(() => {
    const timeline = timelineRef.current;
    if (!timeline) return;
    if (playing) timeline.play();
    else timeline.pause();
  }, [playing]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)
        return;
      if (event.code === 'Space') {
        event.preventDefault();
        setPlaying((current) => !current);
      }
      if (event.key === 'ArrowRight') goToScene(sceneIndex + 1);
      if (event.key === 'ArrowLeft') goToScene(sceneIndex - 1);
      if (event.key.toLowerCase() === 'r') {
        setPlaying(true);
        setRunId((current) => current + 1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [goToScene, sceneIndex]);

  const replay = () => {
    setPlaying(true);
    setRunId((current) => current + 1);
  };

  const copyCleanLink = async () => {
    const url = new URL(window.location.href);
    url.search = '';
    url.searchParams.set('scene', scene.id);
    url.searchParams.set('format', format);
    url.searchParams.set('chrome', '0');
    url.searchParams.set('loop', loop ? '1' : '0');
    await navigator.clipboard.writeText(url.toString());
  };

  return (
    <main
      className={styles.demo}
      data-format={format}
      data-chrome={showChrome ? 'visible' : 'hidden'}
      ref={rootRef}
    >
      <div className={styles.ambientWash} aria-hidden="true" />
      <div className={styles.dotField} aria-hidden="true" />

      {showChrome ? (
        <header className={styles.studioHeader}>
          <div className={styles.studioIdentity}>
            <Image
              alt=""
              className={styles.studioLogo}
              height={26}
              priority
              src="/assets/brand/claire-app-icon-lime.svg"
              width={26}
            />
            <span>Ask Claire</span>
            <span className={styles.studioDivider} />
            <span className={styles.studioMeta}>interactive product film</span>
          </div>
          <div className={styles.headerTools}>
            <div className={styles.formatSwitch} aria-label="Demo aspect ratio">
              {(['landscape', 'square', 'mobile'] as const).map((item) => (
                <button
                  aria-pressed={format === item}
                  className={format === item ? styles.formatButtonActive : styles.formatButton}
                  key={item}
                  onClick={() => setFormat(item)}
                  type="button"
                >
                  <span className={styles[`formatIcon${item[0].toUpperCase()}${item.slice(1)}`]} />
                  {item}
                </button>
              ))}
            </div>
            <button
              className={styles.cleanLinkButton}
              onClick={() => void copyCleanLink()}
              type="button"
            >
              <FilmIcon />
              Copy clean link
            </button>
          </div>
        </header>
      ) : null}

      <section className={styles.stageArea} aria-label="Ask Claire animated product demo">
        <div className={styles.stage}>
          <div className={styles.appFrame} data-app-frame>
            <aside className={styles.sidebar}>
              <div className={styles.askSidebarHeader}>
                <span>
                  <SparklesIcon />
                  ASK CLAIRE
                </span>
                <button aria-label="New Ask Claire conversation" type="button">
                  <PlusIcon />
                </button>
              </div>

              <div className={styles.sidebarSection}>
                {DEMO_SCENES.map((item, index) => (
                  <button
                    className={index === sceneIndex ? styles.recentItemActive : styles.recentItem}
                    key={item.id}
                    onClick={() => goToScene(index)}
                    type="button"
                  >
                    <strong>{item.label}</strong>
                    <small>Conversation context · {index === 0 ? 'now' : `${index + 1}d`}</small>
                  </button>
                ))}
              </div>

              <div className={styles.privateNote}>
                <span className={styles.monoLabel}>
                  <LockClosedIcon /> PRIVATE BY DEFAULT
                </span>
                <p>Claire cites connected messages and never sends from this workspace.</p>
              </div>
            </aside>

            <section className={styles.conversationPanel}>
              <header className={styles.conversationHeader}>
                <div>
                  <span className={styles.monoLabel}>CONNECTED CONTEXT</span>
                  <h1>Ask Claire</h1>
                  <p>
                    Use conversations, relationship context, and open loops to make the next move
                    easier.
                  </p>
                </div>
                <span className={styles.readOnlyPill}>
                  <span /> Read only
                </span>
              </header>

              <div className={styles.conversationBody}>
                <div className={styles.threadTrack} data-thread-track>
                  <div
                    className={styles.userQuestion}
                    data-query-bubble
                    aria-label={scene.question}
                  >
                    {scene.question.split('').map((character, index) => (
                      <span aria-hidden="true" data-query-character key={`${character}-${index}`}>
                        {character === ' ' ? '\u00A0' : character}
                      </span>
                    ))}
                  </div>

                  <div className={styles.thinkingCard} data-thinking-card>
                    <div className={styles.thinkingHeader}>
                      <Mark compact />
                      <span>Claire is connecting the dots</span>
                      <span className={styles.thinkingDots}>
                        <i data-thinking-dot />
                        <i data-thinking-dot />
                        <i data-thinking-dot />
                      </span>
                    </div>
                    <div className={styles.thinkingSteps}>
                      <span data-thinking-row>
                        <CheckCircleIcon /> Understanding what you mean
                      </span>
                      <span data-thinking-row>
                        <MagnifyingGlassIcon /> Reading relevant conversations
                      </span>
                      <span data-thinking-row>
                        <UserGroupIcon /> Connecting people, places, and plans
                      </span>
                    </div>
                  </div>

                  <article className={styles.answerCard} data-answer-card>
                    <span className={styles.answerEyebrow}>{scene.eyebrow}</span>
                    <h2>{words(scene.answer)}</h2>
                    <p>{words(scene.detail)}</p>
                    <div className={styles.sourceStack} data-source-stack>
                      <span className={styles.miniAvatars}>
                        {scene.sources.map((source) => (
                          <span className={SOURCE_TONE_CLASS[source.tone]} key={source.name}>
                            {source.initials}
                          </span>
                        ))}
                      </span>
                      <span>Grounded in {scene.sources.length} conversations</span>
                      <ChevronRightIcon />
                    </div>
                    <div className={styles.answerActions}>
                      {scene.actions.map((action, index) => (
                        <button
                          className={index === 0 ? styles.primaryAction : styles.secondaryAction}
                          data-action-button
                          key={action}
                          type="button"
                        >
                          {index === 0 && scene.id === 'saturday' ? <CalendarDaysIcon /> : null}
                          {index === 0 && scene.id === 'birthday' ? <UserGroupIcon /> : null}
                          {index === 0 && scene.id === 'russian' ? (
                            <ChatBubbleLeftRightIcon />
                          ) : null}
                          {action}
                          <ChevronRightIcon />
                        </button>
                      ))}
                    </div>
                  </article>

                  <div className={styles.followUpExchange} data-follow-up-exchange>
                    <div
                      aria-label={scene.followUpQuestion}
                      className={styles.followUpQuestion}
                      data-follow-up-bubble
                    >
                      {scene.followUpQuestion.split('').map((character, index) => (
                        <span
                          aria-hidden="true"
                          data-follow-up-character
                          key={`${character}-${index}`}
                        >
                          {character === ' ' ? '\u00A0' : character}
                        </span>
                      ))}
                    </div>
                    <div className={styles.followUpThinking} data-follow-up-thinking>
                      <Mark compact />
                      <span>Claire is checking the conversation</span>
                      <span className={styles.thinkingDots}>
                        <i data-follow-up-thinking-dot />
                        <i data-follow-up-thinking-dot />
                        <i data-follow-up-thinking-dot />
                      </span>
                    </div>
                    <article className={styles.followUpAnswer} data-follow-up-answer>
                      <Mark compact />
                      <div>
                        <span className={styles.answerEyebrow}>FOLLOW-UP</span>
                        <p>
                          {scene.followUpAnswer.split(' ').map((word, index) => (
                            <span
                              className={styles.revealWord}
                              data-follow-up-word
                              key={`${word}-${index}`}
                            >
                              {word}{' '}
                            </span>
                          ))}
                        </p>
                        <button data-follow-up-action type="button">
                          <ChatBubbleLeftRightIcon />
                          {scene.followUpAction}
                          <ChevronRightIcon />
                        </button>
                      </div>
                    </article>
                  </div>
                </div>
              </div>

              <footer className={styles.composer}>
                <span className={styles.composerPrompt}>
                  Ask anything about your conversations…
                </span>
                <span className={styles.composerCaret} data-composer-caret />
                <div className={styles.composerTools}>
                  <span className={styles.contextPill}>All conversations</span>
                  <button aria-label="Send question" data-send-button type="button">
                    <ArrowUpIcon />
                  </button>
                </div>
              </footer>
            </section>

            <aside className={styles.contextRail}>
              <div className={styles.contextHeading}>
                <span>CLAIRE’S CONTEXT</span>
                <small>Evidence appears as Claire reads your connected messages.</small>
              </div>

              <div className={styles.contextSources}>
                {scene.sources.map((source) => (
                  <article
                    className={styles.sourceCard}
                    data-source-card
                    key={`${scene.id}-${source.name}`}
                  >
                    <header>
                      <span className={`${styles.sourceAvatar} ${SOURCE_TONE_CLASS[source.tone]}`}>
                        {source.initials}
                      </span>
                      <span>
                        <strong>{source.name}</strong>
                        <small>
                          <PlatformGlyph platform={source.platform} /> {source.platform}
                        </small>
                      </span>
                      <time>{source.time}</time>
                    </header>
                    <p>“{source.excerpt}”</p>
                    <button type="button">
                      Open message <ChevronRightIcon />
                    </button>
                  </article>
                ))}
              </div>

              <article className={styles.resultCard} data-result-card>
                <span className={styles.resultIcon}>
                  {scene.id === 'saturday' ? (
                    <CalendarDaysIcon />
                  ) : scene.id === 'birthday' ? (
                    <UserGroupIcon />
                  ) : (
                    <MapPinIcon />
                  )}
                </span>
                <span className={styles.monoLabel}>{scene.resultLabel}</span>
                <strong>{scene.resultValue}</strong>
                <small>{scene.resultMeta}</small>
                <span className={styles.relationshipLine}>
                  <ClockIcon /> {scene.relationship}
                </span>
              </article>
            </aside>
          </div>
          <MobileAskClaireScene scene={scene} />
          <div className={styles.progressTrack} aria-hidden="true">
            <span data-progress-fill />
          </div>
        </div>
      </section>

      {showChrome ? (
        <footer className={styles.playbackBar}>
          <div className={styles.playbackControls}>
            <button
              aria-label={playing ? 'Pause demo' : 'Play demo'}
              className={styles.playButton}
              onClick={() => setPlaying((current) => !current)}
              type="button"
            >
              {playing ? <PauseIcon /> : <PlayIcon />}
            </button>
            <button
              aria-label="Replay scene"
              className={styles.iconButton}
              onClick={replay}
              type="button"
            >
              <ArrowPathIcon />
            </button>
          </div>

          <div className={styles.sceneSelector} aria-label="Demo scenes">
            {DEMO_SCENES.map((item, index) => (
              <button
                aria-pressed={sceneIndex === index}
                className={sceneIndex === index ? styles.sceneButtonActive : styles.sceneButton}
                key={item.id}
                onClick={() => goToScene(index)}
                type="button"
              >
                <span>0{index + 1}</span>
                {item.shortLabel}
              </button>
            ))}
          </div>

          <label className={styles.loopControl}>
            <input
              checked={loop}
              onChange={(event) => setLoop(event.target.checked)}
              type="checkbox"
            />
            <span />
            Loop scenes
          </label>
        </footer>
      ) : null}
    </main>
  );
}
