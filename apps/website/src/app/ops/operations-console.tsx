'use client';

import { createClient, type Session } from '@supabase/supabase-js';
import { useCallback, useEffect, useMemo, useState } from 'react';

type Check = { component: string; status: 'healthy' | 'warning' | 'critical' | 'unknown'; summary: string; details: Record<string, string | number | boolean | null> };
type Incident = { id: string; component: string; severity: string; title: string; status: string; last_detected_at: string; resolved_at: string | null };
type Admin = { id: string; email: string; role: 'owner' | 'operator' | 'viewer'; created_at: string };

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://api.useclaire.co';
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

const statusTone: Record<Check['status'], string> = { healthy: 'bg-mint', warning: 'bg-lime', critical: 'bg-coral text-paper', unknown: 'bg-neutral-200' };

export function OperationsConsole() {
  const [session, setSession] = useState<Session | null>(null);
  const [checks, setChecks] = useState<Check[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');

  const request = useCallback(async (path: string, init?: RequestInit) => {
    if (!session) throw new Error('Sign in required');
    const response = await fetch(`${apiUrl}/operations${path}`, { ...init, headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json', ...(init?.headers || {}) } });
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Operations request failed');
    return response.status === 204 ? null : response.json();
  }, [session]);

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true); setError('');
    try {
      const [snapshot, incidentData, adminData] = await Promise.all([request('/snapshot'), request('/incidents'), request('/admins')]);
      setChecks(snapshot.checks || []); setIncidents(incidentData.incidents || []); setAdmins(adminData.admins || []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load Operations'); }
    finally { setLoading(false); }
  }, [request, session]);

  useEffect(() => {
    if (!supabase) { setError('Operations Console is missing its public Supabase configuration.'); setLoading(false); return; }
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => listener.subscription.unsubscribe();
  }, []);
  useEffect(() => { void load(); }, [load]);

  const health = useMemo(() => checks.some((check) => check.status === 'critical') ? 'needs attention' : checks.some((check) => check.status === 'warning') ? 'watching' : 'healthy', [checks]);
  const signIn = async () => { if (!supabase) return; await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/ops/confirm` } }); };
  const refresh = async () => { await request('/snapshot/refresh', { method: 'POST' }); await load(); };
  const addAdmin = async (event: React.FormEvent) => { event.preventDefault(); if (!email) return; await request('/admins', { method: 'POST', body: JSON.stringify({ email, role: 'viewer' }) }); setEmail(''); await load(); };
  const removeAdmin = async (id: string) => { await request(`/admins/${id}`, { method: 'DELETE' }); await load(); };

  if (!session) return <main className="grid min-h-screen place-items-center bg-cream p-6"><section className="w-full max-w-md rounded-xl border-2 border-ink bg-paper p-8 shadow-lg"><p className="font-mono text-xs uppercase tracking-[.18em]">Claire / Internal</p><h1 className="mt-3 text-4xl font-bold">Operations Console</h1><p className="mt-3 text-neutral-600">Private, metadata-only system health. Customer conversations are never available here.</p><button className="mt-7 w-full rounded-lg border-2 border-ink bg-lime px-4 py-3 font-semibold" onClick={() => void signIn()}>Continue with Google</button>{error && <p className="mt-4 text-sm text-danger">{error}</p>}</section></main>;

  return <main className="min-h-screen bg-cream px-5 py-6 md:px-10"><header className="mx-auto flex max-w-6xl items-center justify-between border-b-2 border-ink pb-5"><div><p className="font-mono text-xs uppercase tracking-[.18em]">Claire / Internal</p><h1 className="text-3xl font-bold">Operations Console</h1></div><div className="text-right"><span className="rounded-full border border-ink bg-lime px-3 py-1 font-mono text-xs uppercase">{health}</span><p className="mt-2 text-xs text-neutral-600">{session.user.email}</p></div></header>
    <div className="mx-auto mt-6 max-w-6xl space-y-6">{error && <p className="rounded-lg border border-coral bg-blush p-3 text-sm">{error}</p>}<section className="grid gap-3 md:grid-cols-3"><article className="rounded-xl border border-ink bg-paper p-5"><p className="font-mono text-xs uppercase">Service checks</p><strong className="mt-2 block text-4xl">{checks.length}</strong></article><article className="rounded-xl border border-ink bg-paper p-5"><p className="font-mono text-xs uppercase">Open incidents</p><strong className="mt-2 block text-4xl">{incidents.filter((item) => item.status === 'open').length}</strong></article><article className="rounded-xl border border-ink bg-paper p-5"><p className="font-mono text-xs uppercase">Privacy boundary</p><strong className="mt-2 block text-lg">No chat content</strong></article></section>
    <section className="rounded-xl border border-ink bg-paper p-5"><div className="flex items-center justify-between"><h2 className="text-xl font-bold">Live system health</h2><button className="rounded-md border border-ink px-3 py-2 text-sm" onClick={() => void refresh()}>Run check now</button></div><div className="mt-4 grid gap-3 md:grid-cols-2">{loading ? <p>Loading health…</p> : checks.map((check) => <article key={check.component} className="rounded-lg border border-neutral-200 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-mono text-xs">{check.component}</p><p className="mt-2 font-medium">{check.summary}</p></div><span className={`rounded-full px-2 py-1 font-mono text-[10px] uppercase ${statusTone[check.status]}`}>{check.status}</span></div></article>)}</div></section>
    <section className="grid gap-6 md:grid-cols-2"><article className="rounded-xl border border-ink bg-paper p-5"><h2 className="text-xl font-bold">Incidents</h2><div className="mt-3 space-y-2">{incidents.length ? incidents.slice(0, 8).map((incident) => <div key={incident.id} className="border-t border-neutral-200 py-3"><p className="font-medium">{incident.title}</p><p className="font-mono text-xs text-neutral-600">{incident.component} · {incident.status}</p></div>) : <p className="text-neutral-600">No recorded incidents.</p>}</div></article><article className="rounded-xl border border-ink bg-paper p-5"><h2 className="text-xl font-bold">Dashboard access</h2><p className="mt-1 text-sm text-neutral-600">Google establishes identity; this allowlist controls console access.</p><form className="mt-4 flex gap-2" onSubmit={addAdmin}><input className="min-w-0 flex-1 rounded-md border border-ink px-3 py-2" type="email" placeholder="person@company.com" value={email} onChange={(event) => setEmail(event.target.value)} /><button className="rounded-md border border-ink bg-lime px-3 py-2">Add</button></form><div className="mt-3 space-y-2">{admins.map((admin) => <div key={admin.id} className="flex items-center justify-between border-t border-neutral-200 py-2 text-sm"><span>{admin.email} <em className="font-mono text-xs not-italic text-neutral-600">{admin.role}</em></span><button className="text-danger disabled:text-neutral-400" disabled={admin.role === 'owner'} onClick={() => void removeAdmin(admin.id)}>Remove</button></div>)}</div></article></section></div></main>;
}
