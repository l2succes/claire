#!/usr/bin/env bun

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const EAS_CLI_PACKAGE = 'eas-cli@23.2.0';
const DEFAULT_LABELS = [
  'source/testflight',
  'bug',
  'type/bug',
  'area/client',
  'area/testing',
  'p2',
];

export interface TestFlightScreenshot {
  expirationDate?: string;
  height?: number;
  url?: string;
  width?: number;
}

export interface TestFlightFeedback {
  id: string;
  appUptimeInMilliseconds?: number;
  architecture?: string;
  batteryPercentage?: number;
  buildVersion?: string;
  comment?: string;
  connectionType?: string;
  createdDate?: string;
  deviceFamily?: string;
  deviceModel?: string;
  diskBytesAvailable?: number;
  diskBytesTotal?: number;
  locale?: string;
  osVersion?: string;
  screenshots?: TestFlightScreenshot[];
  testerEmail?: string;
  testerName?: string;
  timeZone?: string;
}

interface FeedbackPage {
  feedback: TestFlightFeedback[];
  hasNextPage?: boolean;
  limit?: number;
  offset?: number;
  total?: number;
}

interface ExistingIssue {
  body?: string;
  number: number;
  title: string;
  url: string;
}

export interface ImportOptions {
  help: boolean;
  limit: number;
  offset: number;
  profile: string;
  repository?: string;
  write: boolean;
}

const scriptPath = fileURLToPath(import.meta.url);
const scriptDirectory = path.dirname(scriptPath);
const repositoryRoot = path.resolve(scriptDirectory, '..');
const clientDirectory = path.join(repositoryRoot, 'apps', 'client');

function usage(): string {
  return `Import TestFlight screenshot feedback into GitHub issues.

Usage:
  bun run testflight:tickets [options]

Options:
  --write              Create issues. Without this flag, only preview changes.
  --limit <1-200>      Number of feedback submissions to fetch (default: 50).
  --offset <number>    Start at this TestFlight result offset (default: 0).
  --profile <name>     EAS submit profile used for Apple credentials (default: production).
  --repo <owner/name>  GitHub repository (default: current repository).
  -h, --help           Show this help.
`;
}

function valueAfter(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${flag} requires a value.`);
  }
  return value;
}

function integerOption(raw: string, flag: string, minimum: number, maximum?: number): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum || (maximum !== undefined && value > maximum)) {
    const range =
      maximum === undefined ? `at least ${minimum}` : `between ${minimum} and ${maximum}`;
    throw new Error(`${flag} must be an integer ${range}.`);
  }
  return value;
}

export function parseArguments(args: string[]): ImportOptions {
  const options: ImportOptions = {
    help: false,
    limit: 50,
    offset: 0,
    profile: 'production',
    write: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    switch (argument) {
      case '--write':
        options.write = true;
        break;
      case '--limit':
        options.limit = integerOption(valueAfter(args, index, argument), argument, 1, 200);
        index += 1;
        break;
      case '--offset':
        options.offset = integerOption(valueAfter(args, index, argument), argument, 0);
        index += 1;
        break;
      case '--profile':
        options.profile = valueAfter(args, index, argument);
        index += 1;
        break;
      case '--repo':
        options.repository = valueAfter(args, index, argument);
        index += 1;
        break;
      case '-h':
      case '--help':
        options.help = true;
        break;
      default:
        throw new Error(`Unknown option: ${argument}`);
    }
  }

  return options;
}

interface RunOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  stderr?: 'inherit' | 'pipe';
}

function run(command: string, args: string[], options: RunOptions = {}): string {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repositoryRoot,
    encoding: 'utf8',
    env: options.env ?? process.env,
    maxBuffer: 20 * 1024 * 1024,
    stdio: ['ignore', 'pipe', options.stderr ?? 'pipe'],
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const detail = result.stderr?.trim() || result.stdout?.trim() || `exit code ${result.status}`;
    throw new Error(`${command} ${args[0] ?? ''} failed: ${detail}`);
  }
  return result.stdout.trim();
}

export function parseFeedbackPage(raw: string): FeedbackPage {
  let page: unknown;
  try {
    page = JSON.parse(raw);
  } catch {
    throw new Error('EAS returned invalid JSON for TestFlight feedback.');
  }

  if (!page || typeof page !== 'object' || !Array.isArray((page as FeedbackPage).feedback)) {
    throw new Error('EAS returned an unexpected TestFlight feedback response.');
  }
  return page as FeedbackPage;
}

function resolveRepository(explicitRepository?: string): string {
  if (explicitRepository) return explicitRepository;
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY;
  return run('gh', ['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner']);
}

function fetchFeedback(options: ImportOptions): FeedbackPage {
  const nodeOptions = [process.env.NODE_OPTIONS, '--dns-result-order=ipv4first']
    .filter(Boolean)
    .join(' ');
  const args = [
    'x',
    EAS_CLI_PACKAGE,
    'testflight:feedback',
    '--profile',
    options.profile,
    '--limit',
    String(options.limit),
    '--offset',
    String(options.offset),
    '--json',
  ];

  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return parseFeedbackPage(
        run(process.execPath, args, {
          cwd: clientDirectory,
          env: { ...process.env, NODE_OPTIONS: nodeOptions },
        })
      );
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        const delaySeconds = attempt * 3;
        console.warn(`TestFlight fetch failed; retrying in ${delaySeconds}s (${attempt}/3).`);
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delaySeconds * 1000);
      }
    }
  }
  throw lastError;
}

function listExistingIssues(repository: string): ExistingIssue[] {
  const raw = run('gh', [
    'issue',
    'list',
    '--repo',
    repository,
    '--state',
    'all',
    '--limit',
    '1000',
    '--json',
    'number,title,body,url',
  ]);
  return JSON.parse(raw) as ExistingIssue[];
}

export function feedbackMarker(id: string): string {
  return `<!-- testflight-feedback-id:${id} -->`;
}

function oneLine(value: string): string {
  return value
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(value: string, maximumLength: number): string {
  if (value.length <= maximumLength) return value;
  return `${value.slice(0, maximumLength - 1).trimEnd()}…`;
}

export function issueTitle(feedback: TestFlightFeedback): string {
  const build = oneLine(feedback.buildVersion || 'unknown');
  const comment = oneLine(feedback.comment || 'Feedback submitted without a written comment');
  return `[TestFlight build ${build}] ${truncate(comment, 120)}`;
}

export function formatBytes(bytes?: number): string {
  if (bytes === undefined || !Number.isFinite(bytes)) return 'Unknown';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

export function formatDuration(milliseconds?: number): string {
  if (milliseconds === undefined || !Number.isFinite(milliseconds)) return 'Unknown';
  const totalSeconds = Math.max(0, Math.round(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function markdownText(value: string): string {
  return value.replace(/\r\n?/g, '\n').trim();
}

export function issueBody(feedback: TestFlightFeedback): string {
  const screenshotCount = feedback.screenshots?.length ?? 0;
  const device =
    [feedback.deviceModel, feedback.deviceFamily, feedback.architecture]
      .filter(Boolean)
      .join(' · ') || 'Unknown';
  const disk =
    feedback.diskBytesAvailable === undefined && feedback.diskBytesTotal === undefined
      ? 'Unknown'
      : `${formatBytes(feedback.diskBytesAvailable)} available of ${formatBytes(feedback.diskBytesTotal)}`;
  const comment = markdownText(feedback.comment || '_No written comment was included._');

  return [
    '## TestFlight feedback',
    '',
    comment,
    '',
    '## Environment',
    '',
    `- Submitted: ${feedback.createdDate || 'Unknown'}`,
    `- Build: ${feedback.buildVersion || 'Unknown'}`,
    `- Device: ${device}`,
    `- iOS: ${feedback.osVersion || 'Unknown'}`,
    `- Locale / time zone: ${feedback.locale || 'Unknown'} / ${feedback.timeZone || 'Unknown'}`,
    `- Connection: ${feedback.connectionType || 'Unknown'}`,
    `- Battery: ${feedback.batteryPercentage === undefined ? 'Unknown' : `${feedback.batteryPercentage}%`}`,
    `- App uptime: ${formatDuration(feedback.appUptimeInMilliseconds)}`,
    `- Disk: ${disk}`,
    `- Screenshots: ${screenshotCount} (open the submission in TestFlight; signed screenshot URLs expire and are not copied into GitHub)`,
    '',
    '## Acceptance checklist',
    '',
    '- [ ] Reproduce on the real iOS app or document why it cannot be reproduced.',
    '- [ ] Fix the underlying behavior with an appropriate regression test.',
    '- [ ] Verify the fix on the iOS Simulator and the next TestFlight build.',
    '',
    '## Source',
    '',
    `- TestFlight feedback ID: \`${feedback.id}\``,
    '- Imported by `bun run testflight:tickets`.',
    '',
    feedbackMarker(feedback.id),
  ].join('\n');
}

function ensureSourceLabel(repository: string): void {
  run('gh', [
    'label',
    'create',
    'source/testflight',
    '--repo',
    repository,
    '--color',
    '0E8A16',
    '--description',
    'Imported from TestFlight feedback',
    '--force',
  ]);
}

function createIssue(repository: string, feedback: TestFlightFeedback): string {
  return run('gh', [
    'issue',
    'create',
    '--repo',
    repository,
    '--title',
    issueTitle(feedback),
    '--body',
    issueBody(feedback),
    ...DEFAULT_LABELS.flatMap((label) => ['--label', label]),
  ]);
}

export function findExistingIssue(
  issues: ExistingIssue[],
  feedback: TestFlightFeedback
): ExistingIssue | undefined {
  const marker = feedbackMarker(feedback.id);
  return issues.find((issue) => issue.body?.includes(marker) || issue.body?.includes(feedback.id));
}

async function main(): Promise<void> {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage());
    return;
  }

  const repository = resolveRepository(options.repository);
  const page = fetchFeedback(options);
  const existingIssues = listExistingIssues(repository);
  const pending = page.feedback.filter((feedback) => !findExistingIssue(existingIssues, feedback));

  console.log(
    `Fetched ${page.feedback.length} of ${page.total ?? page.feedback.length} TestFlight submission(s); ` +
      `${page.feedback.length - pending.length} already imported.`
  );

  for (const feedback of page.feedback) {
    const existing = findExistingIssue(existingIssues, feedback);
    if (existing) {
      console.log(`SKIP  #${existing.number} ${existing.title}`);
      continue;
    }
    console.log(`${options.write ? 'CREATE' : 'WOULD CREATE'}  ${issueTitle(feedback)}`);
  }

  if (!options.write) {
    console.log(
      `\nDry run only. Run \`bun run testflight:tickets --write\` to create ${pending.length} issue(s).`
    );
    return;
  }

  if (pending.length === 0) {
    console.log('\nNo new issues to create.');
    return;
  }

  ensureSourceLabel(repository);
  const created: string[] = [];
  for (const feedback of pending) {
    const url = createIssue(repository, feedback);
    created.push(url);
    console.log(`CREATED  ${url}`);
  }
  console.log(`\nCreated ${created.length} issue(s) in ${repository}.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
