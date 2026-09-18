'use client';

// SPDX-License-Identifier: Apache-2.0
import { useGSAP } from '@gsap/react';
import {
  ArrowPathIcon,
  ArrowUpIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  ClockIcon,
  EllipsisHorizontalIcon,
  InformationCircleIcon,
  MagnifyingGlassIcon,
  PaperClipIcon,
  PauseIcon,
  PencilSquareIcon,
  PlayIcon,
  SparklesIcon,
  VideoCameraIcon,
} from '@heroicons/react/24/outline';
import gsap from 'gsap';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import styles from './conversation-loop-demo.module.css';

gsap.registerPlugin(useGSAP);

type ConversationLoopDemoProps = {
  initialAutoplay: boolean;
  initialChrome: boolean;
  initialLoop: boolean;
};

const conversations = [
  { initials: 'MK', name: 'Maya Kim', preview: 'I’ll send it tomorrow before 10.', time: 'now', tone: 'blush' },
  { initials: 'SO', name: 'Sofia Ortega', preview: 'That place looks perfect ✨', time: '3h', tone: 'mint' },
  { initials: 'DR', name: 'Dad', preview: 'Call me when you land.', time: '5h', tone: 'sky' },
  { initials: 'NW', name: 'Noah Williams', preview: 'I can make the introduction.', time: 'Tue', tone: 'lavender' },
] as const;

function ClaireGlyph() {
  return (
    <svg aria-hidden="true" className={styles.claireGlyph} viewBox="0 0 64 64">
      <g transform="translate(64 0) scale(-1 1)">
        <path
          d="M10 34c0-13 9-22 22-22s22 8 22 20-9 20-21 20c-10 0-17-6-17-14 0-7 5-12 12-12 6 0 10 4 10 9 0 6-4 10-10 10"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="7"
        />
        <circle cx="10" cy="34" fill="#dfff64" r="4" />
      </g>
    </svg>
  );
}

export function ConversationLoopDemo({
  initialAutoplay,
  initialChrome,
  initialLoop,
}: ConversationLoopDemoProps) {
  const rootRef = useRef<HTMLElement>(null);
  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  const [playing, setPlaying] = useState(initialAutoplay);
  const [loop, setLoop] = useState(initialLoop);
  const [runId, setRunId] = useState(0);

  useGSAP(
    () => {
      const root = rootRef.current;
      if (!root) return;

      const typedCharacters = root.querySelectorAll('[data-reply-character]');
      const progressFill = root.querySelector('[data-progress-fill]');
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      gsap.set('[data-stage-frame]', { autoAlpha: 1 });
      gsap.set(typedCharacters, { autoAlpha: 0 });
      gsap.set('[data-sent-message]', { autoAlpha: 0, y: 18, scale: 0.985 });
      gsap.set('[data-message-loop-badge]', { autoAlpha: 0, scale: 0.8 });
      gsap.set('[data-detection]', { autoAlpha: 0, y: 10 });
      gsap.set('[data-chat-loop-card]', { autoAlpha: 0, y: -8 });
      gsap.set('[data-empty-loop]', { autoAlpha: 1 });
      gsap.set('[data-inspector-loop]', { autoAlpha: 0, y: 14, scale: 0.98 });
      gsap.set('[data-inbox-loop-badge]', { autoAlpha: 0, scale: 0 });
      gsap.set('[data-toast]', { autoAlpha: 0, y: -14, scale: 0.96 });
      gsap.set(progressFill, { scaleX: 0, transformOrigin: 'left center' });

      if (reducedMotion) {
        gsap.set(typedCharacters, { autoAlpha: 1 });
        gsap.set(
          [
            '[data-sent-message]',
            '[data-message-loop-badge]',
            '[data-chat-loop-card]',
            '[data-inspector-loop]',
            '[data-inbox-loop-badge]',
          ],
          { autoAlpha: 1, x: 0, y: 0, scale: 1 },
        );
        gsap.set('[data-empty-loop]', { autoAlpha: 0 });
        gsap.set(progressFill, { scaleX: 1 });
        return;
      }

      const timeline = gsap.timeline({
        paused: !playing,
        defaults: { ease: 'power3.out' },
        onUpdate: () => gsap.set(progressFill, { scaleX: timeline.progress() }),
        onComplete: () => {
          if (loop) setRunId((current) => current + 1);
          else setPlaying(false);
        },
      });
      timelineRef.current = timeline;

      timeline
        .fromTo('[data-stage-frame]', { y: 10, scale: 0.993 }, { y: 0, scale: 1, duration: 0.7 })
        .from('[data-existing-message]', { autoAlpha: 0, y: 13, duration: 0.38, stagger: 0.18 }, 0.28)
        .to({}, { duration: 1.6 })
        .to(typedCharacters, { autoAlpha: 1, duration: 0.02, stagger: 0.038, ease: 'none' })
        .to('[data-composer-caret]', { autoAlpha: 0, duration: 0.12 }, '<')
        .to('[data-send]', { scale: 0.86, duration: 0.1, ease: 'power2.in' })
        .to('[data-send]', { scale: 1, duration: 0.22, ease: 'back.out(2)' })
        .to('[data-composer-copy]', { autoAlpha: 0, y: -5, duration: 0.18 }, '<')
        .to('[data-sent-message]', { autoAlpha: 1, y: 0, scale: 1, duration: 0.46 }, '>-0.02')
        .to({}, { duration: 2.8 })
        .to('[data-detection]', { autoAlpha: 1, y: 0, duration: 0.42 })
        .to('[data-detection-pulse]', { scale: 1.12, duration: 0.42, yoyo: true, repeat: 2 }, '<')
        .to('[data-message-loop-badge]', { autoAlpha: 1, scale: 1, duration: 0.34, ease: 'back.out(1.8)' })
        .to('[data-chat-loop-card]', { autoAlpha: 1, y: 0, duration: 0.5 }, '<0.04')
        .to('[data-empty-loop]', { autoAlpha: 0, y: -7, duration: 0.22 }, '<')
        .to('[data-inspector-loop]', { autoAlpha: 1, y: 0, scale: 1, duration: 0.52 }, '>-0.02')
        .to('[data-inbox-loop-badge]', { autoAlpha: 1, scale: 1, duration: 0.35, ease: 'back.out(2)' }, '<0.08')
        .to('[data-toast]', { autoAlpha: 1, y: 0, scale: 1, duration: 0.42 }, '<0.06')
        .to('[data-toast]', { autoAlpha: 0, y: -8, duration: 0.35 }, '>1.8')
        .to('[data-detection]', { autoAlpha: 0, y: -7, duration: 0.28 }, '<')
        .to({}, { duration: 9 });

      return () => {
        timelineRef.current = null;
      };
    },
    { scope: rootRef, dependencies: [loop, runId] },
  );

  useEffect(() => {
    const timeline = timelineRef.current;
    if (!timeline) return;
    if (playing) timeline.play();
    else timeline.pause();
  }, [playing]);

  const replay = () => {
    setPlaying(true);
    setRunId((current) => current + 1);
  };

  const copyCleanLink = async () => {
    const url = new URL(window.location.href);
    url.search = '';
    url.searchParams.set('chrome', '0');
    url.searchParams.set('loop', loop ? '1' : '0');
    await navigator.clipboard.writeText(url.toString());
  };

  return (
    <main className={styles.demo} data-chrome={initialChrome ? 'visible' : 'hidden'} ref={rootRef}>
      <div className={styles.ambient} aria-hidden="true" />
      {initialChrome ? (
        <header className={styles.studioHeader}>
          <div className={styles.studioIdentity}>
            <Image alt="" height={26} priority src="/assets/brand/claire-app-icon-lime.svg" width={26} />
            <strong>Conversation → Loop</strong>
            <span />
            <small>interactive product film</small>
          </div>
          <button className={styles.cleanLink} onClick={() => void copyCleanLink()} type="button">
            Copy clean link
          </button>
        </header>
      ) : null}

      <section className={styles.stageArea} aria-label="Conversation becoming a loop demo">
        <div className={styles.stage}>
          <div className={styles.appFrame} data-stage-frame>
            <aside className={styles.inboxPane}>
              <header>
                <h1>Inbox</h1>
                <button aria-label="New message" type="button"><PencilSquareIcon /></button>
              </header>
              <div className={styles.searchField}><MagnifyingGlassIcon /> Search conversations</div>
              <div className={styles.filters}>
                <span className={styles.filterActive}>All</span><span>Unread 3</span><span>Needs reply</span>
              </div>
              <div className={styles.recentLabel}><span>RECENT</span><span>24</span></div>
              <div className={styles.conversationList}>
                {conversations.map((conversation, index) => (
                  <article className={index === 0 ? styles.conversationActive : styles.conversationRow} key={conversation.name}>
                    <span className={`${styles.avatar} ${styles[conversation.tone]}`}>{conversation.initials}</span>
                    <span>
                      <strong>{conversation.name}</strong>
                      <small>{conversation.preview}</small>
                    </span>
                    <time>{conversation.time}</time>
                    {index === 0 ? <span className={styles.inboxLoopBadge} data-inbox-loop-badge><CheckCircleIcon /></span> : null}
                  </article>
                ))}
              </div>
            </aside>

            <section className={styles.chatPane}>
              <header className={styles.chatHeader}>
                <span className={`${styles.avatar} ${styles.blush}`}>MK</span>
                <span>
                  <strong>Maya Kim</strong>
                  <small><Image alt="" height={12} src="/assets/platforms/whatsapp.svg" width={12} /> WhatsApp · active now</small>
                </span>
                <div>
                  <button aria-label="Video call" type="button"><VideoCameraIcon /></button>
                  <button aria-label="Conversation info" type="button"><InformationCircleIcon /></button>
                </div>
              </header>

              <div className={styles.chatLoopCard} data-chat-loop-card>
                <span><CheckCircleIcon /></span>
                <span><small>OPEN LOOP</small><strong>Send Maya the updated deck</strong></span>
                <span>View <ChevronRightIcon /></span>
              </div>

              <div className={styles.transcript}>
                <time>Today · 9:41 AM</time>
                <div className={styles.incomingBubble} data-existing-message>
                  Do you think you can send the updated deck before tomorrow’s client call?
                  <small>9:41</small>
                </div>
                <div className={styles.outgoingBubbleSmall} data-existing-message>
                  Yes—just making the last edits now.
                  <small>9:43 · ✓✓</small>
                </div>
                <div className={styles.incomingBubble} data-existing-message>
                  Amazing, thank you. The call starts at 10:30.
                  <small>9:44</small>
                </div>
                <div className={styles.sentMessage} data-sent-message>
                  <span>I’ll send it tomorrow before 10.</span>
                  <small>9:45 · ✓✓</small>
                  <em data-message-loop-badge>OPEN LOOP</em>
                </div>
                <div className={styles.detection} data-detection>
                  <span data-detection-pulse><ClaireGlyph /></span>
                  <span><strong>Claire noticed a promise</strong><small>Turning it into a loop so it doesn’t get lost.</small></span>
                </div>
              </div>

              <footer className={styles.composer}>
                <button aria-label="Attach something" type="button"><PaperClipIcon /></button>
                <span className={styles.composerCopy} data-composer-copy>
                  {'I’ll send it tomorrow before 10.'.split('').map((character, index) => (
                    <i data-reply-character key={`${character}-${index}`}>{character === ' ' ? '\u00A0' : character}</i>
                  ))}
                  <i className={styles.caret} data-composer-caret />
                </span>
                <button aria-label="Send message" className={styles.sendButton} data-send type="button"><ArrowUpIcon /></button>
              </footer>

              <div className={styles.toast} data-toast>
                <CheckCircleIcon /> Loop created
              </div>
            </section>

            <aside className={styles.inspectorPane}>
              <div className={styles.profile}>
                <span className={`${styles.profileAvatar} ${styles.blush}`}>MK</span>
                <h2>Maya Kim</h2>
                <p>Business · Product lead</p>
                <div><button type="button">Profile</button><button type="button">Media</button><button type="button"><EllipsisHorizontalIcon /></button></div>
              </div>
              <section className={styles.inspectorSection}>
                <span>RELATIONSHIP MEMORY</span>
                <div className={styles.memoryCard}><strong>Warm + direct</strong><p>Keep replies concise. Surface open decisions and avoid over-explaining.</p></div>
              </section>
              <section className={styles.inspectorSection}>
                <span>OPEN LOOPS</span>
                <div className={styles.emptyLoop} data-empty-loop><span>○</span><p><strong>No open loops right now</strong><small>Claire will surface one when it appears</small></p></div>
                <article className={styles.inspectorLoop} data-inspector-loop>
                  <span><CheckCircleIcon /></span>
                  <div><small>YOU PROMISED</small><strong>Send Maya the updated deck</strong><p><ClockIcon /> Tomorrow, before 10:00 AM</p></div>
                  <button type="button">Open <ChevronRightIcon /></button>
                </article>
              </section>
            </aside>
          </div>
          <div className={styles.progress}><span data-progress-fill /></div>
        </div>
      </section>

      {initialChrome ? (
        <footer className={styles.playbackBar}>
          <div>
            <button aria-label={playing ? 'Pause demo' : 'Play demo'} className={styles.playButton} onClick={() => setPlaying((value) => !value)} type="button">
              {playing ? <PauseIcon /> : <PlayIcon />}
            </button>
            <button aria-label="Replay demo" className={styles.replayButton} onClick={replay} type="button"><ArrowPathIcon /></button>
          </div>
          <span><SparklesIcon /> A normal message becomes something Claire can help you keep.</span>
          <label>
            <input checked={loop} onChange={(event) => setLoop(event.target.checked)} type="checkbox" />
            <i /> Loop demo
          </label>
        </footer>
      ) : null}
    </main>
  );
}
