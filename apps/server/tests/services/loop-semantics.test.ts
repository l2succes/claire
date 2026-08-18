/**
 * Platform loop semantics.
 *
 * This table is what keeps `if (platform === 'slack')` out of the detector, so
 * the properties worth testing are the ones the pipeline depends on rather than
 * the literal values. See docs/LOOPS_REVAMP_PLAN.md §11.
 */

import { describe, it, expect } from 'bun:test';
import {
  loopSemanticsFor,
  hasBroadcastMention,
  DEFAULT_LOOP_SEMANTICS,
} from '@claire/platform-catalog';

describe('loopSemanticsFor', () => {
  it('falls back to safe defaults for an unknown platform', () => {
    // A bridge added to the catalog before it is characterised here must still
    // produce usable behavior rather than undefined lookups.
    expect(loopSemanticsFor('some-future-bridge')).toEqual(DEFAULT_LOOP_SEMANTICS);
  });

  it('marks WhatsApp mentions as phone-style', () => {
    // Text-matching "@Name" finds nothing on WhatsApp; only m.mentions works.
    expect(loopSemanticsFor('whatsapp').mentionStyle).toBe('phone');
  });

  it('scopes Slack identity per workspace, not per account', () => {
    // The same person has a different user id in every workspace, so
    // self-identity caching must be keyed on the account, not the platform.
    expect(loopSemanticsFor('slack').selfIdentityScope).toBe('workspace');
    expect(loopSemanticsFor('whatsapp').selfIdentityScope).toBe('account');
  });

  it('defaults channel platforms to low sensitivity and DM platforms to normal', () => {
    // Users opt channels in; they should not have to opt a firehose out.
    for (const id of ['slack', 'discord', 'zulip', 'irc']) {
      expect(loopSemanticsFor(id).defaultGroupSensitivity).toBe('low');
      expect(loopSemanticsFor(id).groupModel).toBe('channels');
    }
    for (const id of ['whatsapp', 'telegram', 'imessage']) {
      expect(loopSemanticsFor(id).defaultGroupSensitivity).toBe('normal');
      expect(loopSemanticsFor(id).groupModel).toBe('participants');
    }
  });

  it('flags native threading only where threads actually partition a channel', () => {
    expect(loopSemanticsFor('slack').threading).toBe('native_threads');
    expect(loopSemanticsFor('discord').threading).toBe('native_threads');
    expect(loopSemanticsFor('whatsapp').threading).toBe('reply');
    expect(loopSemanticsFor('irc').threading).toBe('none');
  });

  it('returns an override merged over the defaults, not a bare override', () => {
    const slack = loopSemanticsFor('slack');
    // memberCountAvailable is set explicitly; threading comes from the override;
    // every other key must still be present from the defaults.
    expect(Object.keys(slack).sort()).toEqual(Object.keys(DEFAULT_LOOP_SEMANTICS).sort());
  });
});

describe('hasBroadcastMention', () => {
  it('detects Slack broadcast tokens', () => {
    expect(hasBroadcastMention('slack', 'hey @channel standup moved to 10')).toBe(true);
    expect(hasBroadcastMention('slack', '@here can someone deploy?')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(hasBroadcastMention('slack', 'Hey @Channel!')).toBe(true);
  });

  it('does not fire on a personal mention', () => {
    expect(hasBroadcastMention('slack', 'hey @luc can you review this?')).toBe(false);
  });

  it('returns false on platforms with no broadcast syntax', () => {
    // "@channel" is just text in a WhatsApp group; it addresses nobody.
    expect(hasBroadcastMention('whatsapp', 'hey @channel')).toBe(false);
  });

  it('handles empty and missing text', () => {
    expect(hasBroadcastMention('slack', '')).toBe(false);
  });
});
