'use client';

import { createClient, type Session } from '@supabase/supabase-js';
import { useCallback, useEffect, useMemo, useState } from 'react';

type Status = 'healthy' | 'warning' | 'critical' | 'unknown';
type Check = { component: string; status: Status; summary: string; details: Record<string, string | number | boolean | null> };
type Incident = { id: string; component: string; severity: string; title: string; status: string; last_detected_at: string; resolved_at: string | null };
type Admin = { id: string; email: string; role: 'owner' | 'operator' | 'viewer'; created_at: string };

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://api.useclaire.co';
const operationsOAuthCallbackUrl = 'https://useclaire.co/ops/confirm';
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

const statusCopy: Record<Status, string> = { healthy: 'healthy', warning: 'attention', critical: 'critical', unknown: 'unknown' };
const statusClass: Record<Status, string> = { healthy: 'bg-[#4abd6b]', warning: 'bg-[#ffad3d]', critical: 'bg-coral', unknown: 'bg-neutral-400' };
const componentNames: Record<string, string> = { postgres: 'Postgres', redis: 'Redis', matrix: 'Synapse', bridge_sessions: 'Platform bridges' };

function statusFromChecks(checks: Check[]): Status {
  if (checks.some((check) => check.status === 'critical')) return 'critical';
  if (checks.some((check) => check.status === 'warning')) return 'warning';
  return checks.length && checks.every((check) => check.status === 'healthy') ? 'healthy' : 'unknown';
}

function StatusDot({ status }: { status: Status }) {
  return <span aria-label={statusCopy[status]} className={`inline-block size-3 shrink-0 rounded-full ${statusClass[status]}`} />;
}

function StatusLabel({ status }: { status: Status }) {
  const color = status === 'healthy' ? 'text-[#277d41]' : status === 'warning' ? 'text-[#a86000]' : status === 'critical' ? 'text-danger' : 'text-neutral-600';
  return <span className={`font-mono text-xs font-semibold uppercase ${color}`}>{statusCopy[status]}</span>;
}

function ServiceTile({ check }: { check: Check }) {
  return <article className="rounded-[18px] border border-neutral-200 bg-paper px-4 py-3">
    <div className="flex items-center gap-3"><StatusDot status={check.status} /><strong className="text-lg tracking-[-0.025em]">{componentNames[check.component] || check.component}</strong></div>
    <p className="mt-1 font-mono text-sm text-neutral-600">{check.summary}</p>
  </article>;
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-5 border-t border-neutral-200 py-4 first:border-t-0 first:pt-0"><span>{label}</span><strong className="shrink-0 font-mono font-medium">{value}</strong></div>;
}

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

  const health = useMemo(() => statusFromChecks(checks), [checks]);
  const byComponent = useMemo(() => new Map(checks.map((check) => [check.component, check])), [checks]);
  const bridge = byComponent.get('bridge_sessions');
  const messageFlow = checks.find((check) => check.component.startsWith('message_flow:'));
  const serviceChecks = checks.filter((check) => ['postgres', 'redis', 'matrix', 'bridge_sessions'].includes(check.component));
  const openIncidents = incidents.filter((incident) => incident.status === 'open');
  const measuredWindow = Number(messageFlow?.details.freshnessMinutes || 120);
  const messageCount = Number(messageFlow?.details.recentCount || 0);
  const connected = Number(bridge?.details.connected || 0);
  const needsAttention = Number(bridge?.details.disconnected || 0);
  const headline = health === 'healthy' ? 'All core paths green' : health === 'warning' ? 'Attention required' : health === 'critical' ? 'Messaging needs attention' : 'Health is still loading';

  const signIn = async () => { if (!supabase) return; await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: operationsOAuthCallbackUrl } }); };
  const refresh = async () => { await request('/snapshot/refresh', { method: 'POST' }); await load(); };
  const addAdmin = async (event: React.FormEvent) => { event.preventDefault(); if (!email) return; await request('/admins', { method: 'POST', body: JSON.stringify({ email, role: 'viewer' }) }); setEmail(''); await load(); };
  const removeAdmin = async (id: string) => { await request(`/admins/${id}`, { method: 'DELETE' }); await load(); };

  if (!session) return <main className="grid min-h-screen place-items-center bg-cream p-5"><section className="w-full max-w-xl border border-ink bg-paper p-8 shadow-[7px_7px_0_#dfff64]"><p className="font-mono text-xs font-semibold uppercase tracking-[.16em] text-neutral-600">Claire · Operations</p><h1 className="mt-2 font-display text-5xl font-bold tracking-[-.065em]">Messaging health</h1><p className="mt-5 max-w-md text-lg text-neutral-600">A private, metadata-only view of whether Claire’s messaging system is working.</p><button className="mt-8 border-2 border-ink bg-lime px-5 py-3 font-semibold transition hover:bg-[#ccee49]" onClick={() => void signIn()}>Continue with Google</button>{error && <p className="mt-4 text-sm text-danger">{error}</p>}</section></main>;

  return <main className="min-h-screen bg-cream px-3 py-5 text-ink sm:px-8 lg:px-14"><div className="mx-auto max-w-[1500px]">
    <header className="flex flex-col gap-5 border-b border-[#c8c8c0] pb-6 sm:flex-row sm:items-end sm:justify-between"><div><p className="font-mono text-xs font-semibold uppercase tracking-[.18em] text-neutral-600">Claire · Operations</p><h1 className="mt-1 font-display text-5xl font-bold tracking-[-.07em] sm:text-6xl">Messaging health</h1></div><div className="flex items-center gap-3"><span className={`rounded-full border-2 border-ink px-5 py-2 font-mono text-sm font-semibold uppercase tracking-[.05em] ${health === 'healthy' ? 'bg-lime' : health === 'warning' ? 'bg-[#ffe3ad]' : health === 'critical' ? 'bg-coral text-paper' : 'bg-paper'}`}>{headline}</span><button className="border border-ink bg-paper px-3 py-2 text-sm font-semibold hover:bg-neutral-100" onClick={() => void refresh()}>Refresh</button></div></header>
    {error && <p className="mt-5 border border-danger bg-blush px-4 py-3 text-sm">{error}</p>}
    <div className="mt-9 grid gap-7 lg:grid-cols-[1.45fr_.95fr]">
      <section className="border border-[#c8c8c0] bg-paper p-5 sm:p-8"><h2 className="text-2xl font-semibold tracking-[-.035em]">Message path</h2><p className="mt-2 text-lg text-neutral-600">No content, participant names, or message previews.</p><div className="mt-8 flex flex-wrap items-center gap-3 font-semibold sm:gap-4"><span className="border-2 border-ink px-4 py-3">Platform bridge</span><span className="text-3xl text-neutral-400">→</span><span className="border-2 border-ink px-4 py-3">Matrix</span><span className="text-3xl text-neutral-400">→</span><span className="border-2 border-ink px-4 py-3">Claire API</span><span className="text-3xl text-neutral-400">→</span><span className="border-2 border-ink px-4 py-3">Postgres</span><span className="text-3xl text-neutral-400">→</span><span className="border-2 border-ink px-4 py-3">Clients</span></div><div className="mt-6 text-lg"><MetricRow label="Messages ingested" value={messageFlow ? `${messageCount} / ${measuredWindow} min` : 'Measuring'} /><MetricRow label="Bridge sessions" value={bridge ? `${connected} connected · ${needsAttention} attention` : 'Measuring'} /><MetricRow label="Current monitor state" value={loading ? 'Refreshing' : headline} /><MetricRow label="Open incidents" value={String(openIncidents.length)} /></div></section>
      <section className="border border-[#c8c8c0] bg-paper p-5 sm:p-8"><h2 className="text-2xl font-semibold tracking-[-.035em]">Service health</h2><div className="mt-6 grid gap-4 sm:grid-cols-2">{serviceChecks.map((check) => <ServiceTile key={check.component} check={check} />)}{!serviceChecks.length && <p className="text-neutral-600">Loading service checks…</p>}</div></section>
      <section className="border border-[#c8c8c0] bg-paper p-5 sm:p-8"><h2 className="text-2xl font-semibold tracking-[-.035em]">Account health</h2><p className="mt-2 text-lg text-neutral-600">Only platform state and operational counters.</p><div className="mt-6 divide-y divide-neutral-200">{checks.filter((check) => check.component.startsWith('message_flow:')).map((check) => { const platform = check.component.replace('message_flow:', ''); return <div className="flex items-center justify-between gap-5 py-5" key={check.component}><div className="flex items-center gap-4"><span className="grid size-12 place-items-center rounded-full bg-mint font-mono font-semibold uppercase">{platform.slice(0, 2)}</span><div><p className="font-semibold capitalize">{platform}</p><p className="text-neutral-600">{check.summary}</p></div></div><StatusLabel status={check.status} /></div>; })}{bridge && needsAttention > 0 && <div className="flex items-center justify-between gap-5 py-5"><div className="flex items-center gap-4"><span className="grid size-12 place-items-center rounded-full bg-[#ffe3ad] font-mono font-semibold">!</span><div><p className="font-semibold">Bridge recovery</p><p className="text-neutral-600">{needsAttention} session{needsAttention === 1 ? '' : 's'} need attention</p></div></div><StatusLabel status="warning" /></div>}</div></section>
      <section className="border border-[#c8c8c0] bg-paper p-5 sm:p-8"><h2 className="text-2xl font-semibold tracking-[-.035em]">Actions</h2><div className="mt-6 divide-y divide-neutral-200">{openIncidents.length ? openIncidents.slice(0, 3).map((incident) => <div className="flex justify-between gap-4 py-5" key={incident.id}><div><p className="font-semibold">{incident.title}</p><p className="mt-1 font-mono text-sm text-neutral-600">{incident.component} · {incident.severity}</p></div><StatusLabel status={incident.severity === 'critical' ? 'critical' : 'warning'} /></div>) : <div className="py-5 text-neutral-600">No open incidents.</div>}</div><div className="mt-6 flex flex-wrap gap-3"><button className="border-2 border-ink bg-lime px-4 py-3 font-semibold hover:bg-[#ccee49]" onClick={() => void refresh()}>Run check now</button><a className="border border-ink px-4 py-3 font-semibold hover:bg-neutral-100" href="#access">Manage access</a></div></section>
    </div>
    <section id="access" className="mt-7 border border-[#c8c8c0] bg-paper p-5 sm:p-8"><div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between"><div><h2 className="text-2xl font-semibold tracking-[-.035em]">Dashboard access</h2><p className="mt-2 text-neutral-600">Google establishes identity; this allowlist controls console access.</p></div><form className="flex w-full max-w-xl gap-2" onSubmit={addAdmin}><input className="min-w-0 flex-1 border border-ink bg-paper px-3 py-2" type="email" placeholder="person@company.com" value={email} onChange={(event) => setEmail(event.target.value)} /><button className="border border-ink bg-lime px-4 py-2 font-semibold">Add</button></form></div><div className="mt-6 divide-y divide-neutral-200">{admins.map((admin) => <div className="flex items-center justify-between gap-3 py-3" key={admin.id}><span>{admin.email} <em className="ml-2 font-mono text-xs not-italic text-neutral-600">{admin.role}</em></span><button className="text-sm font-semibold text-danger disabled:text-neutral-400" disabled={admin.role === 'owner'} onClick={() => void removeAdmin(admin.id)}>Remove</button></div>)}</div></section>
    <section className="mt-7 bg-[#151a16] p-6 text-paper sm:p-8"><h2 className="text-2xl font-semibold tracking-[-.035em]">Privacy boundary</h2><p className="mt-3 max-w-5xl text-lg leading-relaxed text-[#d9ddd6]">Operators can see service state, timing, delivery outcome, error class, and aggregated platform health. Conversation bodies, attachments, participant names, phone numbers, and full message IDs are never rendered or searchable here.</p><div className="mt-5 flex flex-wrap gap-2 font-mono text-sm"><span className="rounded-full border border-[#78806e] px-3 py-1">metadata-only</span><span className="rounded-full border border-[#78806e] px-3 py-1">RBAC</span><span className="rounded-full border border-[#78806e] px-3 py-1">audited actions</span><span className="rounded-full border border-[#78806e] px-3 py-1">break-glass disabled by default</span></div></section>
  </div></main>;
}
