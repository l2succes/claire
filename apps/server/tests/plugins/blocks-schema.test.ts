/**
 * What a plugin may and may not put inside a loop.
 *
 * These are the security rules, not formatting preferences. The validator runs
 * before persistence precisely so that no renderer has to be trusted, and these
 * tests are what stop that guarantee eroding.
 */

import { describe, expect, it } from 'bun:test';

import {
  validateLoopBlocks,
  type BlockValidationContext,
} from '../../src/plugins/blocks/schema';

function context(overrides: Partial<BlockValidationContext> = {}): BlockValidationContext {
  return {
    grantedCapabilityIds: new Set(['calendar.create_event', 'calendar.propose_time']),
    egressAllowlist: new Set(['calendar.google.com']),
    capabilityRisk: new Map([
      ['calendar.create_event', 'external_write'],
      ['calendar.propose_time', 'read'],
    ]),
    ...overrides,
  };
}

const ACTION = {
  kind: 'action',
  actionId: 'accept',
  label: 'Add to calendar',
  capabilityId: 'calendar.create_event',
  style: 'primary',
  inputPreview: [{ label: 'When', value: 'Wed 3:00 PM' }],
  requiresApproval: false,
  destination: 'calendar.google.com',
};

describe('requiresApproval is computed, never accepted', () => {
  it('overrides a plugin claiming its external write needs no approval', () => {
    // This is the entire attack: a plugin de-escalating its own risk.
    const { blocks } = validateLoopBlocks([ACTION], context());
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ kind: 'action', requiresApproval: true });
  });

  it('does not require approval for a read capability', () => {
    const { blocks } = validateLoopBlocks(
      [{ ...ACTION, capabilityId: 'calendar.propose_time', destination: undefined }],
      context(),
    );
    expect(blocks[0]).toMatchObject({ requiresApproval: false });
  });

  it('treats an unknown capability risk as the most dangerous, not the least', () => {
    const ctx = context({ capabilityRisk: new Map() });
    const { blocks } = validateLoopBlocks([ACTION], ctx);
    expect(blocks[0]).toMatchObject({ requiresApproval: true });
  });
});

describe('capabilities must be installed and granted', () => {
  it('rejects an action for a capability with no grant', () => {
    const { blocks, errors } = validateLoopBlocks(
      [{ ...ACTION, capabilityId: 'calendar.delete_everything' }],
      context(),
    );
    expect(blocks).toHaveLength(0);
    expect(errors.join()).toContain('not installed and granted');
  });

  it('drops choice options whose capability is not granted', () => {
    const { blocks } = validateLoopBlocks(
      [
        {
          kind: 'choice',
          prompt: 'When works?',
          options: [
            { id: 'a', label: 'Wed 3pm', capabilityId: 'calendar.propose_time', input: {} },
            { id: 'b', label: 'Anytime', capabilityId: 'calendar.not_granted', input: {} },
          ],
        },
      ],
      context(),
    );
    expect(blocks[0]).toMatchObject({ kind: 'choice' });
    expect((blocks[0] as { options: unknown[] }).options).toHaveLength(1);
  });
});

describe('links cannot become an exfiltration or phishing channel', () => {
  const link = { kind: 'link', label: 'Open event', url: 'https://calendar.google.com/e/1' };

  it('accepts an allowlisted https link and derives the host itself', () => {
    const { blocks } = validateLoopBlocks([link], context());
    // Host is derived, not accepted — otherwise a plugin could label a link
    // with a host it does not point at.
    expect(blocks[0]).toMatchObject({ kind: 'link', host: 'calendar.google.com' });
  });

  it('rejects a host that is not in the egress allowlist', () => {
    const { blocks, errors } = validateLoopBlocks(
      [{ ...link, url: 'https://evil.example.com/steal' }],
      context(),
    );
    expect(blocks).toHaveLength(0);
    expect(errors.join()).toContain('egress allowlist');
  });

  it('rejects http, which would downgrade the user to cleartext', () => {
    const { blocks, errors } = validateLoopBlocks(
      [{ ...link, url: 'http://calendar.google.com/e/1' }],
      context(),
    );
    expect(blocks).toHaveLength(0);
    expect(errors.join()).toContain('https');
  });

  it('ignores a host field the plugin supplies', () => {
    const { blocks } = validateLoopBlocks(
      [{ ...link, host: 'totally-legit-bank.com' }],
      context(),
    );
    expect(blocks[0]).toMatchObject({ host: 'calendar.google.com' });
  });

  it('rejects a destination outside the allowlist', () => {
    const { blocks, errors } = validateLoopBlocks(
      [{ ...ACTION, destination: 'evil.example.com' }],
      context(),
    );
    expect(blocks).toHaveLength(0);
    expect(errors.join()).toContain('egress allowlist');
  });
});

describe('the plugin supplies data, Claire owns rendering', () => {
  it('rejects a block that tries to carry styling', () => {
    const { blocks, errors } = validateLoopBlocks(
      [{ kind: 'summary', title: 'Hi', body: 'There', color: '#ff0000' }],
      context(),
    );
    expect(blocks).toHaveLength(0);
    expect(errors.join()).toContain('may not set color');
  });

  it('rejects text containing markup', () => {
    const { blocks } = validateLoopBlocks(
      [{ kind: 'summary', title: 'Hi', body: '<img src=x onerror=alert(1)>' }],
      context(),
    );
    expect(blocks).toHaveLength(0);
  });

  it('rejects markup fields even on an action block, which legitimately has style', () => {
    const { blocks, errors } = validateLoopBlocks([{ ...ACTION, html: '<b>x</b>' }], context());
    expect(blocks).toHaveLength(0);
    expect(errors.join()).toContain('may not set html');
  });

  it('still accepts the three named action styles', () => {
    const { blocks } = validateLoopBlocks([ACTION], context());
    expect(blocks[0]).toMatchObject({ style: 'primary' });
  });

  it('rejects an unknown block kind rather than ignoring it', () => {
    // Ignoring would let a newer plugin smuggle a payload past an older server.
    const { blocks, errors } = validateLoopBlocks([{ kind: 'webview', url: 'https://x' }], context());
    expect(blocks).toHaveLength(0);
    expect(errors.join()).toContain('unknown kind');
  });
});

describe('limits', () => {
  it('caps blocks per row and reports the truncation', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({
      kind: 'summary',
      title: `T${i}`,
      body: 'body',
    }));
    const { blocks, errors } = validateLoopBlocks(many, context());
    expect(blocks).toHaveLength(6);
    // Silent truncation would read as "everything was accepted".
    expect(errors.join()).toContain('too many blocks');
  });

  it('rejects an over-long string rather than storing it', () => {
    const { blocks } = validateLoopBlocks(
      [{ kind: 'summary', title: 'ok', body: 'x'.repeat(5000) }],
      context(),
    );
    expect(blocks).toHaveLength(0);
  });

  it('keeps valid blocks when a sibling is invalid', () => {
    // One bad block should not cost the user the whole plugin's output.
    const { blocks } = validateLoopBlocks(
      [{ kind: 'summary', title: 'Good', body: 'fine' }, { kind: 'nonsense' }],
      context(),
    );
    expect(blocks).toHaveLength(1);
  });
});

describe('datetime', () => {
  it('normalizes a valid instant and requires a timezone', () => {
    const { blocks } = validateLoopBlocks(
      [{ kind: 'datetime', label: 'Coffee', start: '2026-08-19T15:00:00Z', timezone: 'America/New_York' }],
      context(),
    );
    expect(blocks[0]).toMatchObject({ kind: 'datetime', start: '2026-08-19T15:00:00.000Z' });
  });

  it('rejects an unparseable start rather than storing it', () => {
    const { blocks } = validateLoopBlocks(
      [{ kind: 'datetime', label: 'Coffee', start: 'next tuesday-ish', timezone: 'UTC' }],
      context(),
    );
    expect(blocks).toHaveLength(0);
  });
});

describe('input shape', () => {
  it('rejects a non-array payload', () => {
    expect(validateLoopBlocks({ kind: 'summary' }, context()).errors.join()).toContain('must be an array');
  });
});
