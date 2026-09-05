// SPDX-License-Identifier: Apache-2.0
'use client';

import { CheckIcon, ClipboardIcon } from '@heroicons/react/24/outline';
import { useEffect, useRef, useState } from 'react';

export function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard access can be denied; leaving the button idle is the honest
      // signal that nothing was copied.
    }
  };

  return (
    <button
      className="doc-copy"
      type="button"
      onClick={copy}
      aria-label={copied ? 'Copied' : label}
      data-copied={copied ? 'true' : undefined}
    >
      {copied ? <CheckIcon aria-hidden="true" /> : <ClipboardIcon aria-hidden="true" />}
      <span>{copied ? 'Copied' : label}</span>
    </button>
  );
}
