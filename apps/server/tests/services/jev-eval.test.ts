import { describe, expect, it } from 'bun:test';
import {
  MODEL, baseline, binaryMetrics, caseSchema, eligible, evaluateRemote, partition,
  requestFor, route, summarize, syntheticCases, type JevResponse,
} from '../../src/services/ai/eval/jev';

const item = () => caseSchema.parse({
  id: 'private-id', conversationId: 'private-chat', source: 'conversation-export', language: 'es',
  isGroup: false, aiEnabled: true, detectionEnabled: true, sensitivity: 'normal',
  messages: [{ ref: 'm1', sender: 'Peer', content: '¿Me puedes enviar la factura?', isSelf: false, at: '2026-09-21T12:00:00Z' }],
  labels: { loopCandidate: true },
});
const answer = (p = 0.9): JevResponse => ({
  model: MODEL, answers: { loop_candidate: { type: 'noul', noul: p }, reply_useful: { type: 'noul', noul: 0.7 } },
  usage: { input_tokens: 1000, output_tokens: 20 },
});

describe('Jev evaluation boundaries', () => {
  it('keeps labels, case IDs and baseline decisions out of inference', () => {
    const body = JSON.stringify(requestFor(item()));
    expect(body).not.toContain('private-id');
    expect(body).not.toContain('private-chat');
    expect(body).not.toContain('labels');
    expect(body).not.toContain('baseline');
  });

  it('does not turn existing relevance expectations into triage labels', () => {
    const original = syntheticCases().find(c => c.id === 'group-not-addressed')!;
    expect(original.labels).toBeUndefined();
  });

  it('blocks remote calls for disabled cases', async () => {
    expect(caseSchema.safeParse({ ...item(), aiEnabled: undefined }).success).toBe(false);
    let calls = 0;
    const transport = (async () => { calls++; return Response.json(answer()); }) as typeof fetch;
    for (const patch of [{ aiEnabled: false }, { detectionEnabled: false }, { sensitivity: 'off' as const }]) {
      const disabled = { ...item(), ...patch };
      expect(eligible(disabled)).toBe(false);
      await expect(evaluateRemote(disabled, 'fake-key', transport)).rejects.toThrow('POLICY_DISABLED');
      expect(route(disabled, answer()).extract).toBe(false);
    }
    expect(calls).toBe(0);
  });

  it('checks the provider contract and refuses malformed or missing group answers', async () => {
    for (const payload of [{ ...answer(), model: 'unexpected-model' }, answer(2), { ...answer(), usage: {} }]) {
      await expect(evaluateRemote(item(), 'fake', (async () => Response.json(payload)) as typeof fetch)).rejects.toThrow('INVALID_TYPESAFE_RESPONSE');
    }
    await expect(evaluateRemote({ ...item(), isGroup: true }, 'fake', (async () => Response.json(answer())) as typeof fetch)).rejects.toThrow('INVALID_TYPESAFE_RESPONSE');
  });

  it('checks the endpoint, abort signal and successful usage', async () => {
    const transport = (async (url: string, init: RequestInit) => {
      expect(url).toBe('https://api.typesafe.ai/v1/systemone');
      expect(init.method).toBe('POST');
      expect(init.redirect).toBe('error');
      expect(init.signal).toBeDefined();
      return Response.json(answer());
    }) as typeof fetch;
    expect((await evaluateRemote(item(), 'fake', transport)).usage.input_tokens).toBe(1000);
  });

  it('does not echo a provider error body', async () => {
    await expect(evaluateRemote(item(), 'fake', (async () => new Response('PRIVATE MESSAGE', { status: 429 })) as typeof fetch))
      .rejects.toThrow('TYPESAFE_HTTP_429');
  });

  it('can recover a Spanish regex miss without treating an API failure as a negative', () => {
    expect(baseline(item()).run).toBe(false);
    expect(route(item(), answer()).extract).toBe(true);
    expect(route(item(), null).reason).toBe('fallback_to_baseline');
    const english = { ...item(), messages: [{ ...item().messages[0], content: 'Can you send the invoice?' }] };
    expect(route(english, null).extract).toBe(true);
  });

  it('protects open loops and explicit watch terms from low model scores', () => {
    expect(route({ ...item(), openLoops: [{ id: 'loop', summary: 'Send invoice' }] }, answer(0)).extract).toBe(true);
    expect(route({ ...item(), watchTerms: ['factura'] }, answer(0)).extract).toBe(true);
  });

  it('rejects chronology errors and duplicate references instead of silently changing input', () => {
    const first = item().messages[0];
    expect(caseSchema.safeParse({ ...item(), messages: [first, first] }).success).toBe(false);
    expect(caseSchema.safeParse({ ...item(), messages: [first, { ...first, ref: 'm2', at: '2026-09-20T12:00:00Z' }] }).success).toBe(false);
  });

  it('holds a conversation in the same split across all its windows', () => {
    expect(partition('a')).toBe(partition('a'));
    expect(new Set(Array.from({ length: 40 }, (_, i) => partition(String(i)))).size).toBe(2);
  });
});

describe('evaluation statistics', () => {
  it('does not invent perfect accuracy without labels or positive examples', () => {
    expect(binaryMetrics([]).recall).toBeNull();
    expect(binaryMetrics([{ expected: false, predicted: false }]).precision).toBeNull();
    expect(summarize([]).groupAccuracy).toBeNull();
    expect(summarize([]).latencyMs.p95).toBeNull();
  });

  it('reports misses, calibration and sample-size uncertainty', () => {
    const result = binaryMetrics([
      { expected: true, predicted: true, probability: 0.9 },
      { expected: true, predicted: false, probability: 0.1 },
      { expected: false, predicted: true, probability: 0.8 },
      { expected: false, predicted: false, probability: 0.2 },
    ]);
    expect(result.recall).toBe(0.5);
    expect(result.precision).toBe(0.5);
    expect(result.fn).toBe(1);
    expect(result.brier).toBeCloseTo(0.375);
    expect(result.recallLower95!).toBeLessThan(0.5);
    expect(binaryMetrics([{ expected: true, predicted: true }]).recallLower95!).toBeLessThan(0.3);
  });
});
