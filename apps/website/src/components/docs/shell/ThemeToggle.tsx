// SPDX-License-Identifier: Apache-2.0
'use client';

import { MoonIcon, SunIcon } from '@heroicons/react/24/outline';
import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'claire-docs-theme';

/*
 * `data-theme` on <html> is the single source of truth, set before first paint
 * by `ThemeScript`. Subscribing to it rather than mirroring it into component
 * state means there is no effect, no hydration mismatch, and no flash.
 */
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => observer.disconnect();
}

const getSnapshot = () => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
const getServerSnapshot = () => 'light' as const;

/**
 * Light/dark toggle scoped to the documentation. The marketing site is
 * deliberately light-only, so the preference lives on `<html data-theme>` and
 * in local storage rather than in a site-wide theme provider.
 */
export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const next = theme === 'dark' ? 'light' : 'dark';

  const toggle = () => {
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem(STORAGE_KEY, next);
  };

  return (
    <button
      className="docs-theme-toggle"
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
    >
      {theme === 'dark' ? <SunIcon aria-hidden="true" /> : <MoonIcon aria-hidden="true" />}
    </button>
  );
}

/**
 * Applies the stored theme before first paint, so a reader who chose dark
 * never sees a flash of the light surface.
 */
export function ThemeScript() {
  const script = `try{var t=localStorage.getItem('${STORAGE_KEY}');if(t!=='dark'&&t!=='light'){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.dataset.theme=t}catch(e){}`;
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
