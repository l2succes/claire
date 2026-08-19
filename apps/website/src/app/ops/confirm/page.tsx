'use client';

import { useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

export default function OperationsConfirmPage() {
  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return;
    const supabase = createClient(url, key);
    void supabase.auth.exchangeCodeForSession(window.location.href).finally(() => window.location.replace('/ops'));
  }, []);
  return <main className="grid min-h-screen place-items-center bg-cream p-6 text-ink"><p className="font-mono text-sm">Completing Claire sign-in…</p></main>;
}
