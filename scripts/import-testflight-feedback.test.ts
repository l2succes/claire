import { describe, expect, test } from 'bun:test';

import {
  feedbackMarker,
  findExistingIssue,
  formatBytes,
  formatDuration,
  issueBody,
  issueTitle,
  parseArguments,
  parseFeedbackPage,
  type TestFlightFeedback,
} from './import-testflight-feedback';

const feedback: TestFlightFeedback = {
  id: 'feedback-123',
  appUptimeInMilliseconds: 92_000,
  architecture: 'ARM64',
  batteryPercentage: 42,
  buildVersion: '9',
  comment: 'The send button overlaps the keyboard.\nPlease fix it.',
  connectionType: 'WIFI',
  createdDate: '2026-08-31T23:33:06.061Z',
  deviceFamily: 'IPHONE',
  deviceModel: 'iPhone17,1',
  diskBytesAvailable: 1_073_741_824,
  diskBytesTotal: 2_147_483_648,
  locale: 'en-US',
  osVersion: '26.6',
  screenshots: [{ url: 'https://example.com/signed-secret' }],
  testerEmail: 'private@example.com',
  testerName: 'Private Tester',
  timeZone: 'America/Mexico_City',
};

describe('parseArguments', () => {
  test('uses safe dry-run defaults', () => {
    expect(parseArguments([])).toEqual({
      help: false,
      limit: 50,
      offset: 0,
      profile: 'production',
      write: false,
    });
  });

  test('accepts import options', () => {
    expect(
      parseArguments([
        '--write',
        '--limit',
        '100',
        '--offset',
        '20',
        '--profile',
        'production-store',
        '--repo',
        'l2succes/claire',
      ])
    ).toEqual({
      help: false,
      limit: 100,
      offset: 20,
      profile: 'production-store',
      repository: 'l2succes/claire',
      write: true,
    });
  });

  test('rejects an out-of-range page size', () => {
    expect(() => parseArguments(['--limit', '201'])).toThrow('between 1 and 200');
  });

  test('handles help and rejects malformed options', () => {
    expect(parseArguments(['--help']).help).toBe(true);
    expect(() => parseArguments(['--offset', '-1'])).toThrow('at least 0');
    expect(() => parseArguments(['--profile'])).toThrow('requires a value');
    expect(() => parseArguments(['--unknown'])).toThrow('Unknown option');
  });
});

describe('EAS response parsing', () => {
  test('accepts a feedback page', () => {
    expect(parseFeedbackPage('{"feedback":[],"total":0}')).toEqual({
      feedback: [],
      total: 0,
    });
  });

  test('rejects invalid or unexpected JSON', () => {
    expect(() => parseFeedbackPage('not-json')).toThrow('invalid JSON');
    expect(() => parseFeedbackPage('{"items":[]}')).toThrow('unexpected');
  });
});

describe('diagnostic formatting', () => {
  test('formats byte counts', () => {
    expect(formatBytes()).toBe('Unknown');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
  });

  test('formats app uptime', () => {
    expect(formatDuration()).toBe('Unknown');
    expect(formatDuration(2100)).toBe('2s');
    expect(formatDuration(92_000)).toBe('1m 32s');
  });
});

describe('GitHub issue formatting', () => {
  test('builds a compact title', () => {
    expect(issueTitle(feedback)).toBe(
      '[TestFlight build 9] The send button overlaps the keyboard. Please fix it.'
    );
  });

  test('preserves useful diagnostics without copying PII or signed URLs', () => {
    const body = issueBody(feedback);

    expect(body).toContain('The send button overlaps the keyboard.');
    expect(body).toContain('iPhone17,1 · IPHONE · ARM64');
    expect(body).toContain('App uptime: 1m 32s');
    expect(body).toContain('1.0 GB available of 2.0 GB');
    expect(body).toContain(feedbackMarker(feedback.id));
    expect(body).not.toContain(feedback.testerEmail!);
    expect(body).not.toContain(feedback.testerName!);
    expect(body).not.toContain(feedback.screenshots![0].url!);
  });

  test('finds an issue previously imported by stable feedback ID', () => {
    const existing = {
      body: `Imported\n${feedbackMarker(feedback.id)}`,
      number: 42,
      title: 'Existing issue',
      url: 'https://github.com/l2succes/claire/issues/42',
    };

    expect(findExistingIssue([existing], feedback)).toEqual(existing);
  });
});
