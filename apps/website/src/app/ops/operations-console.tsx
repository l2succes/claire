'use client';

import { createClient, type Session } from '@supabase/supabase-js';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { PlatformIcon } from '@/components/site/PlatformMark';

type Status = 'healthy' | 'warning' | 'critical' | 'unknown';
type Check = { component: string; status: Status; summary: string; details: Record<string, string | number | boolean | null> };
type Incident = { id: string; component: string; severity: string; title: string; status: string; last_detected_at: string; resolved_at: string | null };
type Admin = { id: string; email: string; role: 'owner' | 'operator' | 'viewer'; created_at: string };
type TelemetryPoint = { at: string; inbound: number; outbound: number; failures: number };
type PlatformTraffic = { platform: string; inbound: number; outbound: number; failed: number; retries: number; activeAccounts: number; lastEventAt: string | null };
type StageMetric = { stage: string; total: number; failed: number; p95Ms: number | null; lastEventAt: string | null };
type JournalEvent = { id: string; platform: string; direction: string; stage: string; outcome: string; durationMs: number | null; retryCount: number; errorClass: string | null; occurredAt: string };
type Telemetry = { rangeMinutes: number; generatedAt: string; totals: { events: number; activeAccounts: number; activeClients: number }; series: TelemetryPoint[]; platforms: PlatformTraffic[]; stages: StageMetric[]; journal: JournalEvent[] };
type BridgeSessionState = 'connected' | 'setup' | 'attention';
type BridgeSession = { accountRef: string; platform: string; state: BridgeSessionState; recovery: string; lastActivityAt: string | null };
type BridgeActivityEvent = { id: string; direction: 'inbound' | 'outbound' | 'system'; stage: 'bridge' | 'matrix'; outcome: 'accepted' | 'failed' | 'retrying' | 'connected' | 'disconnected'; durationMs: number | null; retryCount: number; errorClass: string | null; occurredAt: string };
type BridgeActivity = { total: number; failed: number; retrying: number; p95Ms: number | null; lastEventAt: string | null; events: BridgeActivityEvent[] };
type BridgePlatform = { id: string; name: string; mark: string; bridge: string; supportStatus: 'available' | 'beta' | 'planned' | 'unavailable'; setupLabel: string; runtimeLabel: string; detail: string; flow: string[]; connected: number; setup: number; attention: number; lastActivityAt: string | null; activity: BridgeActivity };
type BridgeData = { generatedAt: string; platforms: BridgePlatform[]; sessions: BridgeSession[] };

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://api.useclaire.co';
const operationsOAuthCallbackUrl = 'https://useclaire.co/ops/confirm';
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;
const configurationError = supabase ? '' : 'Operations Console is missing its public Supabase configuration.';

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

function ServiceTile({ check, onClick }: { check: Check; onClick?: () => void }) {
  const content = <><div className="flex items-center gap-3"><StatusDot status={check.status} /><strong className="text-lg tracking-[-0.025em]">{componentNames[check.component] || check.component}</strong></div>
    <p className="mt-1 font-mono text-sm text-neutral-600">{check.summary}</p>{onClick && <span className="mt-3 inline-block font-mono text-xs font-semibold uppercase text-[#a86000]">View bridge details →</span>}</>;
  return onClick
    ? <button type="button" className="border border-neutral-200 bg-paper px-4 py-3 text-left transition hover:border-ink hover:bg-[#f8f7f2]" onClick={onClick}>{content}</button>
    : <article className="border border-neutral-200 bg-paper px-4 py-3">{content}</article>;
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-5 border-t border-neutral-200 py-4 first:border-t-0 first:pt-0"><span>{label}</span><strong className="shrink-0 font-mono font-medium">{value}</strong></div>;
}

function relativeTime(value: string | null): string {
  if (!value) return 'No signal yet';
  const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  return `${Math.round(seconds / 3600)}h ago`;
}

function TrafficChart({ series }: { series: TelemetryPoint[] }) {
  if (!series.length) return <div className="grid h-40 place-items-center border border-dashed border-neutral-300 font-mono text-sm text-neutral-600">Awaiting instrumented traffic</div>;
  const max = Math.max(1, ...series.map((point) => point.inbound + point.outbound));
  const points = series.map((point, index) => `${(index / Math.max(1, series.length - 1)) * 600},${150 - ((point.inbound + point.outbound) / max) * 130}`).join(' ');
  const failurePoints = series.map((point, index) => `${(index / Math.max(1, series.length - 1)) * 600},${150 - (point.failures / max) * 130}`).join(' ');
  return <div className="relative h-44 overflow-hidden border border-[#c8c8c0] bg-[#f8f7f2] p-3"><div className="absolute inset-x-3 top-1/3 border-t border-dashed border-neutral-200" /><div className="absolute inset-x-3 top-2/3 border-t border-dashed border-neutral-200" /><svg viewBox="0 0 600 160" preserveAspectRatio="none" className="relative h-full w-full" aria-label="Live message volume"><polyline fill="none" stroke="#161a14" strokeWidth="5" points={points} vectorEffect="non-scaling-stroke" /><polyline fill="none" stroke="#e06666" strokeWidth="3" points={failurePoints} vectorEffect="non-scaling-stroke" /></svg><div className="absolute bottom-2 left-3 flex gap-4 font-mono text-[11px] text-neutral-600"><span><i className="mr-1 inline-block size-2 bg-ink" />messages</span><span><i className="mr-1 inline-block size-2 bg-coral" />failures</span></div></div>;
}

function FlowStage({ name, metric }: { name: string; metric?: StageMetric }) {
  const failed = metric?.failed || 0;
  const tone = failed ? 'border-coral bg-blush' : metric ? 'border-ink bg-paper' : 'border-neutral-300 bg-[#f2f1ed]';
  return <div className={`min-w-[130px] border-2 p-3 ${tone}`}><p className="font-semibold capitalize">{name.replace('_', ' ')}</p><p className="mt-1 font-mono text-xs text-neutral-600">{metric ? `${metric.total} events · ${metric.p95Ms === null ? '—' : `p95 ${metric.p95Ms}ms`}` : 'not instrumented'}</p></div>;
}

const bridgeStateStatus: Record<BridgeSessionState, Status> = { connected: 'healthy', setup: 'unknown', attention: 'warning' };
const bridgeStateCopy: Record<BridgeSessionState, string> = { connected: 'connected', setup: 'setup in progress', attention: 'requires attention' };

function BridgeModule({ data, attentionOnly, onClearAttention }: { data: BridgeData | null; attentionOnly: boolean; onClearAttention: () => void }) {
  const [selectedId, setSelectedId] = useState('whatsapp');
  const [showPlanned, setShowPlanned] = useState(false);
  const selected = data?.platforms.find((platform) => platform.id === selectedId) || data?.platforms[0];
  const visiblePlatforms = (data?.platforms || []).filter((platform) => showPlanned || platform.supportStatus !== 'planned');
  const visibleSessions = (data?.sessions || []).filter((session) => !attentionOnly || session.state === 'attention');

  return <>
    <section className="mt-9 border border-[#c8c8c0] bg-paper p-5 sm:p-8">
      <div className="flex flex-col gap-5 border-b border-neutral-200 pb-6 lg:flex-row lg:items-end lg:justify-between"><div><p className="font-mono text-xs font-semibold uppercase tracking-[.16em] text-neutral-600">Connector inventory</p><h2 className="mt-1 text-3xl font-semibold tracking-[-.045em]">Platform bridges</h2><p className="mt-2 max-w-3xl text-lg text-neutral-600">Every planned network, its release state, and the metadata-only path its events take through Claire.</p></div><p className="font-mono text-xs text-neutral-600">{data ? `updated ${relativeTime(data.generatedAt)}` : 'Loading bridge inventory…'}</p></div>
      {attentionOnly && <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border border-[#d89631] bg-[#fff3df] px-4 py-3"><p><strong>Orange means attention, not necessarily an outage.</strong> A connected account needs a reconnect or new authorization; no message content is shown here.</p><button type="button" className="border border-ink bg-paper px-3 py-2 font-semibold" onClick={onClearAttention}>Show all bridge connections</button></div>}
      <div className="mt-7 grid gap-7 xl:grid-cols-[1.1fr_.9fr]">
        <div><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-xl font-semibold">Supported network roadmap</h3><label className="flex items-center gap-2 font-mono text-xs text-neutral-600"><input type="checkbox" checked={showPlanned} onChange={(event) => setShowPlanned(event.target.checked)} /> Show planned ({(data?.platforms.length || 0) - visiblePlatforms.length})</label></div><div className="mt-4 grid gap-3 sm:grid-cols-2">{visiblePlatforms.map((platform) => <button type="button" key={platform.id} onClick={() => setSelectedId(platform.id)} className={`border p-4 text-left transition ${selected?.id === platform.id ? 'border-2 border-ink bg-[#f8f7f2]' : 'border-neutral-200 hover:border-ink'}`}><div className="flex items-start justify-between gap-3"><PlatformIcon id={platform.id} size="md" /><span className={`font-mono text-xs font-semibold uppercase ${platform.supportStatus === 'available' ? 'text-[#277d41]' : platform.supportStatus === 'beta' ? 'text-[#a86000]' : 'text-neutral-600'}`}>{platform.supportStatus === 'available' ? 'live' : platform.supportStatus}</span></div><p className="mt-4 font-semibold">{platform.name}</p><p className="mt-1 font-mono text-xs text-neutral-600">{platform.bridge}</p><p className="mt-3 text-sm text-neutral-600">{platform.connected} connected · {platform.attention} attention</p></button>)}{!data && <p className="text-neutral-600">Loading supported platforms…</p>}</div></div>
        <aside className="border border-ink bg-[#f8f7f2] p-5"><p className="font-mono text-xs font-semibold uppercase tracking-[.14em] text-neutral-600">Selected bridge</p>{selected ? <><div className="mt-3 flex items-center gap-3"><PlatformIcon id={selected.id} size="lg" /><div><h3 className="text-2xl font-semibold">{selected.name}</h3><p className="font-mono text-xs text-neutral-600">{selected.bridge} · {selected.supportStatus === 'available' ? 'live connector' : `${selected.supportStatus} connector`}</p></div></div><p className="mt-5 text-neutral-600">{selected.detail}</p><div className="mt-6 flex flex-wrap items-center gap-2">{selected.flow.map((stage, index) => <span className="flex items-center gap-2 font-mono text-xs" key={stage}><span className="border border-ink bg-paper px-2 py-2">{stage}</span>{index < selected.flow.length - 1 && <span className="text-neutral-500">→</span>}</span>)}</div><dl className="mt-6 divide-y divide-neutral-200 border-y border-neutral-200"><div className="flex justify-between gap-4 py-3"><dt>Connection setup</dt><dd className="font-mono text-sm">{selected.setupLabel}</dd></div><div className="flex justify-between gap-4 py-3"><dt>Runtime</dt><dd className="font-mono text-sm">{selected.runtimeLabel}</dd></div><div className="flex justify-between gap-4 py-3"><dt>Latest session signal</dt><dd className="font-mono text-sm">{relativeTime(selected.lastActivityAt)}</dd></div></dl><div className="mt-6 grid grid-cols-2 gap-3"><div className="border border-neutral-300 bg-paper p-3"><p className="font-mono text-xs uppercase text-neutral-600">Bridge events / 24h</p><strong className="mt-1 block text-2xl">{selected.activity.total}</strong></div><div className="border border-neutral-300 bg-paper p-3"><p className="font-mono text-xs uppercase text-neutral-600">Latest bridge event</p><strong className="mt-1 block text-sm">{relativeTime(selected.activity.lastEventAt)}</strong></div><div className="border border-neutral-300 bg-paper p-3"><p className="font-mono text-xs uppercase text-neutral-600">Failures / retries</p><strong className="mt-1 block text-2xl">{selected.activity.failed} / {selected.activity.retrying}</strong></div><div className="border border-neutral-300 bg-paper p-3"><p className="font-mono text-xs uppercase text-neutral-600">Bridge p95</p><strong className="mt-1 block text-2xl">{selected.activity.p95Ms === null ? '—' : `${selected.activity.p95Ms}ms`}</strong></div></div></> : <p className="mt-4 text-neutral-600">Choose a platform to inspect its path.</p>}</aside>
      </div>
    </section>
    <section className="mt-7 border border-[#c8c8c0] bg-paper p-5 sm:p-8"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-2xl font-semibold tracking-[-.035em]">{selected?.name || 'Platform'} bridge activity</h2><p className="mt-2 text-neutral-600">Last 24 hours of bridge and Matrix boundary events. Structured operational records only—never raw provider logs or message content.</p></div><span className="font-mono text-xs uppercase text-neutral-600">{selected?.activity.events.length || 0} recent events</span></div><div className="mt-6 overflow-x-auto"><table className="w-full min-w-[720px] border-collapse text-left"><thead className="border-y border-neutral-200 font-mono text-xs uppercase text-neutral-600"><tr><th className="px-2 py-3 font-medium">When</th><th className="px-2 py-3 font-medium">Boundary</th><th className="px-2 py-3 font-medium">Direction</th><th className="px-2 py-3 font-medium">Outcome</th><th className="px-2 py-3 font-medium">Timing</th><th className="px-2 py-3 font-medium">Error class</th></tr></thead><tbody>{(selected?.activity.events || []).map((event) => <tr className="border-b border-neutral-200" key={event.id}><td className="px-2 py-3 font-mono text-sm">{relativeTime(event.occurredAt)}</td><td className="px-2 py-3 font-mono text-sm">{event.stage}</td><td className="px-2 py-3 font-mono text-sm">{event.direction}</td><td className="px-2 py-3"><span className={event.outcome === 'failed' ? 'font-mono text-danger' : event.outcome === 'retrying' ? 'font-mono text-[#a86000]' : 'font-mono text-[#277d41]'}>{event.outcome}</span></td><td className="px-2 py-3 font-mono text-sm">{event.durationMs === null ? '—' : `${event.durationMs}ms`}{event.retryCount ? ` · retry ${event.retryCount}` : ''}</td><td className="px-2 py-3 font-mono text-sm text-neutral-600">{event.errorClass || '—'}</td></tr>)}{!selected?.activity.events.length && <tr><td colSpan={6} className="px-2 py-6 text-neutral-600">No bridge-boundary activity has been observed for this platform in the last 24 hours. Session state above remains available for diagnosis.</td></tr>}</tbody></table></div></section>
    <section className="mt-7 border border-[#c8c8c0] bg-paper p-5 sm:p-8"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-2xl font-semibold tracking-[-.035em]">Bridge connection health</h2><p className="mt-2 text-neutral-600">Rotating account references, connection state, timing, and recovery guidance only.</p></div><span className="font-mono text-xs uppercase text-neutral-600">{visibleSessions.length} visible connections</span></div><div className="mt-6 overflow-x-auto"><table className="w-full min-w-[720px] border-collapse text-left"><thead className="border-y border-neutral-200 font-mono text-xs uppercase text-neutral-600"><tr><th className="px-2 py-3 font-medium">Account ref</th><th className="px-2 py-3 font-medium">Platform</th><th className="px-2 py-3 font-medium">State</th><th className="px-2 py-3 font-medium">Latest signal</th><th className="px-2 py-3 font-medium">What to do</th></tr></thead><tbody>{visibleSessions.map((session) => <tr className="border-b border-neutral-200" key={`${session.platform}:${session.accountRef}`}><td className="px-2 py-4 font-mono text-sm">acct_{session.accountRef.slice(0, 8)}</td><td className="px-2 py-4 capitalize">{session.platform}</td><td className="px-2 py-4"><span className="inline-flex items-center gap-2"><StatusDot status={bridgeStateStatus[session.state]} /><span className="font-mono text-xs uppercase">{bridgeStateCopy[session.state]}</span></span></td><td className="px-2 py-4 font-mono text-sm">{relativeTime(session.lastActivityAt)}</td><td className="max-w-md px-2 py-4 text-sm text-neutral-600">{session.recovery}</td></tr>)}{!visibleSessions.length && <tr><td colSpan={5} className="px-2 py-6 text-neutral-600">{attentionOnly ? 'No current bridge connections require attention.' : 'No durable bridge connections have been recorded yet.'}</td></tr>}</tbody></table></div></section>
  </>;
}

export function OperationsConsole() {
  const [session, setSession] = useState<Session | null>(null);
  const [checks, setChecks] = useState<Check[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [telemetry, setTelemetry] = useState<Telemetry | null>(null);
  const [bridges, setBridges] = useState<BridgeData | null>(null);
  const [activeView, setActiveView] = useState<'overview' | 'bridges'>('overview');
  const [bridgeAttentionOnly, setBridgeAttentionOnly] = useState(false);
  const [rangeMinutes, setRangeMinutes] = useState(60);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');

  const request = useCallback(async (path: string, init?: RequestInit) => {
    if (!session) throw new Error('Sign in required');
    const response = await fetch(`${apiUrl}/operations${path}`, { ...init, headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json', ...(init?.headers || {}) } });
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Operations request failed');
    return response.status === 204 ? null : response.json();
  }, [session]);

  const load = useCallback(async (silent = false) => {
    if (!session) return;
    if (!silent) setLoading(true); setError('');
    try {
      const [snapshot, incidentData, adminData, telemetryData, bridgeData] = await Promise.all([request('/snapshot'), request('/incidents'), request('/admins'), request(`/telemetry?rangeMinutes=${rangeMinutes}`), request('/bridges')]);
      setChecks(snapshot.checks || []); setIncidents(incidentData.incidents || []); setAdmins(adminData.admins || []);
      setTelemetry(telemetryData as Telemetry);
      setBridges(bridgeData as BridgeData);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load Operations'); }
    finally { if (!silent) setLoading(false); }
  }, [rangeMinutes, request, session]);

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => listener.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);
  useEffect(() => {
    if (!session) return;
    const timer = setInterval(() => void load(true), 8_000);
    return () => clearInterval(timer);
  }, [load, session]);

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
  const stageByName = useMemo(() => new Map((telemetry?.stages || []).map((stage) => [stage.stage, stage])), [telemetry]);
  const headline = health === 'healthy' ? 'All core paths green' : health === 'warning' ? 'Attention required' : health === 'critical' ? 'Messaging needs attention' : 'Health is still loading';

  const signIn = async () => { if (!supabase) return; await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: operationsOAuthCallbackUrl } }); };
  const refresh = async () => { await request('/snapshot/refresh', { method: 'POST' }); await load(); };
  const addAdmin = async (event: React.FormEvent) => { event.preventDefault(); if (!email) return; await request('/admins', { method: 'POST', body: JSON.stringify({ email, role: 'viewer' }) }); setEmail(''); await load(); };
  const removeAdmin = async (id: string) => { await request(`/admins/${id}`, { method: 'DELETE' }); await load(); };

  if (!session) return <main className="grid min-h-screen place-items-center bg-cream p-5"><section className="w-full max-w-xl border border-ink bg-paper p-8 shadow-[7px_7px_0_#dfff64]"><p className="font-mono text-xs font-semibold uppercase tracking-[.16em] text-neutral-600">Claire · Operations</p><h1 className="mt-2 font-display text-5xl font-bold tracking-[-.065em]">Messaging health</h1><p className="mt-5 max-w-md text-lg text-neutral-600">A private, metadata-only view of whether Claire’s messaging system is working.</p><button className="mt-8 border-2 border-ink bg-lime px-5 py-3 font-semibold transition hover:bg-[#ccee49]" onClick={() => void signIn()}>Continue with Google</button>{(error || configurationError) && <p className="mt-4 text-sm text-danger">{error || configurationError}</p>}</section></main>;

  return <main className="min-h-screen bg-cream px-3 py-5 text-ink sm:px-8 lg:px-14"><div className="mx-auto max-w-[1500px]">
    <header className="flex flex-col gap-5 border-b border-[#c8c8c0] pb-6 sm:flex-row sm:items-end sm:justify-between"><div><p className="font-mono text-xs font-semibold uppercase tracking-[.18em] text-neutral-600">Claire · Operations</p><h1 className="mt-1 font-display text-5xl font-bold tracking-[-.07em] sm:text-6xl">{activeView === 'bridges' ? 'Platform bridges' : 'Messaging health'}</h1><p className="mt-2 font-mono text-xs text-neutral-600">Live metadata · refreshes every 8 seconds {telemetry ? `· updated ${relativeTime(telemetry.generatedAt)}` : ''}</p><nav className="mt-5 flex gap-2" aria-label="Operations sections"><button type="button" className={`border px-3 py-2 font-mono text-xs font-semibold uppercase ${activeView === 'overview' ? 'border-ink bg-ink text-paper' : 'border-neutral-300 bg-paper hover:border-ink'}`} onClick={() => { setActiveView('overview'); setBridgeAttentionOnly(false); }}>Overview</button><button type="button" className={`border px-3 py-2 font-mono text-xs font-semibold uppercase ${activeView === 'bridges' ? 'border-ink bg-ink text-paper' : 'border-neutral-300 bg-paper hover:border-ink'}`} onClick={() => { setActiveView('bridges'); setBridgeAttentionOnly(false); }}>Platform bridges</button></nav></div><div className="flex flex-wrap items-center gap-3"><select aria-label="Telemetry range" className="border border-ink bg-paper px-3 py-2 font-mono text-sm" value={rangeMinutes} onChange={(event) => setRangeMinutes(Number(event.target.value))}><option value={15}>Last 15 min</option><option value={60}>Last hour</option><option value={360}>Last 6 hours</option><option value={1440}>Last 24 hours</option></select><span className={`rounded-full border-2 border-ink px-5 py-2 font-mono text-sm font-semibold uppercase tracking-[.05em] ${health === 'healthy' ? 'bg-lime' : health === 'warning' ? 'bg-[#ffe3ad]' : health === 'critical' ? 'bg-coral text-paper' : 'bg-paper'}`}>{headline}</span><button className="border border-ink bg-paper px-3 py-2 text-sm font-semibold hover:bg-neutral-100" onClick={() => void refresh()}>Refresh</button></div></header>
    {error && <p className="mt-5 border border-danger bg-blush px-4 py-3 text-sm">{error}</p>}
    {activeView === 'bridges' ? <BridgeModule data={bridges} attentionOnly={bridgeAttentionOnly} onClearAttention={() => setBridgeAttentionOnly(false)} /> : <>
    <div className="mt-9 grid gap-7 lg:grid-cols-[1.45fr_.95fr]">
      <section className="border border-[#c8c8c0] bg-paper p-5 sm:p-8"><h2 className="text-2xl font-semibold tracking-[-.035em]">Live message path</h2><p className="mt-2 text-lg text-neutral-600">Stage events are metadata only. An uninstrumented stage is never reported as delivery.</p><div className="mt-8 flex flex-wrap items-center gap-3 sm:gap-4"><FlowStage name="bridge" metric={stageByName.get('bridge')} /><span className="text-3xl text-neutral-400">→</span><FlowStage name="matrix" metric={stageByName.get('matrix')} /><span className="text-3xl text-neutral-400">→</span><FlowStage name="api" metric={stageByName.get('api')} /><span className="text-3xl text-neutral-400">→</span><FlowStage name="database" metric={stageByName.get('database')} /><span className="text-3xl text-neutral-400">→</span><FlowStage name="realtime" metric={stageByName.get('realtime') || stageByName.get('client_ack')} /></div><div className="mt-6 text-lg"><MetricRow label="Messages ingested" value={messageFlow ? `${messageCount} / ${measuredWindow} min` : 'Measuring'} /><MetricRow label="Active client signals" value={telemetry ? String(telemetry.totals.activeClients) : 'Measuring'} /><MetricRow label="Current monitor state" value={loading ? 'Refreshing' : headline} /><MetricRow label="Open incidents" value={String(openIncidents.length)} /></div></section>
      <section className="border border-[#c8c8c0] bg-paper p-5 sm:p-8"><h2 className="text-2xl font-semibold tracking-[-.035em]">Service health</h2><div className="mt-6 grid gap-4 sm:grid-cols-2">{serviceChecks.map((check) => <ServiceTile key={check.component} check={check} onClick={check.component === 'bridge_sessions' && check.status === 'warning' ? () => { setBridgeAttentionOnly(true); setActiveView('bridges'); } : undefined} />)}{!serviceChecks.length && <p className="text-neutral-600">Loading service checks…</p>}</div></section>
      <section className="border border-[#c8c8c0] bg-paper p-5 sm:p-8"><h2 className="text-2xl font-semibold tracking-[-.035em]">Account health</h2><p className="mt-2 text-lg text-neutral-600">Only platform state and operational counters.</p><div className="mt-6 divide-y divide-neutral-200">{checks.filter((check) => check.component.startsWith('message_flow:')).map((check) => { const platform = check.component.replace('message_flow:', ''); return <div className="flex items-center justify-between gap-5 py-5" key={check.component}><div className="flex items-center gap-4"><span className="grid size-12 place-items-center rounded-full bg-mint font-mono font-semibold uppercase">{platform.slice(0, 2)}</span><div><p className="font-semibold capitalize">{platform}</p><p className="text-neutral-600">{check.summary}</p></div></div><StatusLabel status={check.status} /></div>; })}{bridge && needsAttention > 0 && <div className="flex items-center justify-between gap-5 py-5"><div className="flex items-center gap-4"><span className="grid size-12 place-items-center rounded-full bg-[#ffe3ad] font-mono font-semibold">!</span><div><p className="font-semibold">Bridge recovery</p><p className="text-neutral-600">{needsAttention} session{needsAttention === 1 ? '' : 's'} need attention</p></div></div><StatusLabel status="warning" /></div>}</div></section>
      <section className="border border-[#c8c8c0] bg-paper p-5 sm:p-8"><h2 className="text-2xl font-semibold tracking-[-.035em]">Actions</h2><div className="mt-6 divide-y divide-neutral-200">{openIncidents.length ? openIncidents.slice(0, 3).map((incident) => <div className="flex justify-between gap-4 py-5" key={incident.id}><div><p className="font-semibold">{incident.title}</p><p className="mt-1 font-mono text-sm text-neutral-600">{incident.component} · {incident.severity}</p></div><StatusLabel status={incident.severity === 'critical' ? 'critical' : 'warning'} /></div>) : <div className="py-5 text-neutral-600">No open incidents.</div>}</div><div className="mt-6 flex flex-wrap gap-3"><button className="border-2 border-ink bg-lime px-4 py-3 font-semibold hover:bg-[#ccee49]" onClick={() => void refresh()}>Run check now</button><a className="border border-ink px-4 py-3 font-semibold hover:bg-neutral-100" href="#access">Manage access</a></div></section>
    </div>
    <div className="mt-7 grid gap-7 lg:grid-cols-[1.2fr_.8fr]">
      <section className="border border-[#c8c8c0] bg-paper p-5 sm:p-8"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-2xl font-semibold tracking-[-.035em]">Traffic through Claire</h2><p className="mt-2 text-neutral-600">API, database, push, and client signals in the selected window.</p></div><strong className="font-mono text-sm">{telemetry?.totals.events || 0} events · {telemetry?.totals.activeAccounts || 0} accounts</strong></div><div className="mt-6"><TrafficChart series={telemetry?.series || []} /></div><div className="mt-6 grid gap-3 sm:grid-cols-3">{telemetry?.platforms.filter((platform) => platform.platform !== 'mock').map((platform) => <article className="border border-ink bg-[#f8f7f2] p-4" key={platform.platform}><p className="font-semibold capitalize">{platform.platform}</p><p className="mt-2 font-mono text-xl">{platform.inbound + platform.outbound}</p><p className="mt-1 text-sm text-neutral-600">{platform.inbound} in · {platform.outbound} out · {platform.failed} failed</p><p className="mt-2 font-mono text-xs text-neutral-600">last signal {relativeTime(platform.lastEventAt)}</p></article>)}{!telemetry?.platforms.filter((platform) => platform.platform !== 'mock').length && <p className="text-neutral-600">Awaiting supported-platform event telemetry.</p>}</div></section>
      <section className="border border-[#c8c8c0] bg-paper p-5 sm:p-8"><h2 className="text-2xl font-semibold tracking-[-.035em]">Stage timing</h2><p className="mt-2 text-neutral-600">p95 is computed from the selected window.</p><div className="mt-6 divide-y divide-neutral-200">{(telemetry?.stages || []).map((stage) => <div className="flex items-center justify-between gap-4 py-4" key={stage.stage}><div><p className="font-semibold capitalize">{stage.stage.replace('_', ' ')}</p><p className="font-mono text-xs text-neutral-600">{stage.total} events · {stage.failed} failed · {relativeTime(stage.lastEventAt)}</p></div><strong className="font-mono">{stage.p95Ms === null ? '—' : `${stage.p95Ms}ms`}</strong></div>)}{!telemetry?.stages.length && <p className="py-5 text-neutral-600">No timing data yet.</p>}</div></section>
    </div>
    <section className="mt-7 border border-[#c8c8c0] bg-paper p-5 sm:p-8"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-2xl font-semibold tracking-[-.035em]">Operational event journal</h2><p className="mt-2 text-neutral-600">Structured event classes only — no raw log lines, payloads, message text, or identifiers.</p></div><span className="font-mono text-xs uppercase text-neutral-600">Latest {telemetry?.journal.length || 0} events</span></div><div className="mt-6 overflow-x-auto"><table className="w-full min-w-[720px] border-collapse text-left"><thead className="border-y border-neutral-200 font-mono text-xs uppercase text-neutral-600"><tr><th className="px-2 py-3 font-medium">When</th><th className="px-2 py-3 font-medium">Platform</th><th className="px-2 py-3 font-medium">Path</th><th className="px-2 py-3 font-medium">Outcome</th><th className="px-2 py-3 font-medium">Timing</th><th className="px-2 py-3 font-medium">Error class</th></tr></thead><tbody>{(telemetry?.journal || []).map((event) => <tr className="border-b border-neutral-200" key={event.id}><td className="px-2 py-3 font-mono text-sm">{relativeTime(event.occurredAt)}</td><td className="px-2 py-3 capitalize">{event.platform}</td><td className="px-2 py-3 font-mono text-sm">{event.direction} → {event.stage}</td><td className="px-2 py-3"><span className={event.outcome === 'failed' ? 'font-mono text-danger' : 'font-mono text-[#277d41]'}>{event.outcome}</span></td><td className="px-2 py-3 font-mono text-sm">{event.durationMs === null ? '—' : `${event.durationMs}ms`}{event.retryCount ? ` · retry ${event.retryCount}` : ''}</td><td className="px-2 py-3 font-mono text-sm text-neutral-600">{event.errorClass || '—'}</td></tr>)}{!telemetry?.journal.length && <tr><td colSpan={6} className="px-2 py-5 text-neutral-600">Awaiting privacy-safe event telemetry.</td></tr>}</tbody></table></div></section>
    <section id="access" className="mt-7 border border-[#c8c8c0] bg-paper p-5 sm:p-8"><div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between"><div><h2 className="text-2xl font-semibold tracking-[-.035em]">Dashboard access</h2><p className="mt-2 text-neutral-600">Google establishes identity; this allowlist controls console access.</p></div><form className="flex w-full max-w-xl gap-2" onSubmit={addAdmin}><input className="min-w-0 flex-1 border border-ink bg-paper px-3 py-2" type="email" placeholder="person@company.com" value={email} onChange={(event) => setEmail(event.target.value)} /><button className="border border-ink bg-lime px-4 py-2 font-semibold">Add</button></form></div><div className="mt-6 divide-y divide-neutral-200">{admins.map((admin) => <div className="flex items-center justify-between gap-3 py-3" key={admin.id}><span>{admin.email} <em className="ml-2 font-mono text-xs not-italic text-neutral-600">{admin.role}</em></span><button className="text-sm font-semibold text-danger disabled:text-neutral-400" disabled={admin.role === 'owner'} onClick={() => void removeAdmin(admin.id)}>Remove</button></div>)}</div></section>
    <section className="mt-7 bg-[#151a16] p-6 text-paper sm:p-8"><h2 className="text-2xl font-semibold tracking-[-.035em]">Privacy boundary</h2><p className="mt-3 max-w-5xl text-lg leading-relaxed text-[#d9ddd6]">Operators can see service state, timing, delivery outcome, error class, and aggregated platform health. Conversation bodies, attachments, participant names, phone numbers, and full message IDs are never rendered or searchable here.</p><div className="mt-5 flex flex-wrap gap-2 font-mono text-sm"><span className="rounded-full border border-[#78806e] px-3 py-1">metadata-only</span><span className="rounded-full border border-[#78806e] px-3 py-1">RBAC</span><span className="rounded-full border border-[#78806e] px-3 py-1">audited actions</span><span className="rounded-full border border-[#78806e] px-3 py-1">break-glass disabled by default</span></div></section>
    </>}
  </div></main>;
}
