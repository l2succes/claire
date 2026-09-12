/**
 * Demo account provisioning
 *
 * Creates (or repairs) a demo account and asks a running Claire API to seed it.
 *
 *   bun run demo:seed -- --email demo@example.com
 *   bun run demo:seed -- --email demo@example.com --reset
 *   bun run demo:seed -- --email demo@example.com --api https://api.staging.example.com
 *
 * The split of work is deliberate. Account provisioning needs the service key
 * and happens here; message seeding needs the real ingestion pipeline and so
 * happens inside the server, over HTTP. This script authenticates as the demo
 * account to make that call — the seeding routes are gated on the *caller*
 * being a demo account, which is what keeps the surface unreachable for real
 * users rather than relying on a shared admin secret.
 */

import { createClient } from '@supabase/supabase-js';

import { supabaseConfig } from '../config';
import { demoFixtureSummary } from '../demo/fixtures';

interface Args {
  email: string;
  apiUrl: string;
  reset: boolean;
  name: string;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const value = (flag: string): string | undefined => {
    const withEquals = argv.find((arg) => arg.startsWith(`${flag}=`));
    if (withEquals) return withEquals.slice(flag.length + 1);
    const index = argv.indexOf(flag);
    return index >= 0 ? argv[index + 1] : undefined;
  };

  const email = value('--email') || process.env.DEMO_ACCOUNT_EMAIL;
  if (!email) {
    console.error(
      'Missing --email. Pass the demo account address, e.g.\n' +
        '  bun run demo:seed -- --email you+demo@example.com'
    );
    process.exit(1);
  }

  return {
    email,
    apiUrl: (value('--api') || process.env.DEMO_API_URL || 'http://localhost:3001').replace(/\/$/, ''),
    reset: argv.includes('--reset'),
    name: value('--name') || 'Claire Demo',
  };
}

// ─── Provisioning ──────────────────────────────────────────────────────────

const admin = createClient(supabaseConfig.url, supabaseConfig.serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const publicClient = createClient(supabaseConfig.url, supabaseConfig.anonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** Find the auth user for this address, or create a confirmed one. */
async function ensureAuthUser(email: string): Promise<string> {
  // listUsers has no email filter in supabase-js v2, so page until found. A
  // demo environment has few users; this stays cheap.
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const match = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (match) {
      console.log(`• Found existing auth user for ${email}`);
      return match.id;
    }
    if (data.users.length < 200) break;
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
  });
  if (error || !data.user) throw error || new Error('Could not create demo auth user');
  console.log(`• Created auth user for ${email}`);
  return data.user.id;
}

/** Ensure the profile row exists and is flagged as a demo account. */
async function ensureDemoProfile(userId: string, email: string, name: string): Promise<void> {
  const { error } = await admin
    .from('users')
    .upsert({ id: userId, email, name, is_demo: true }, { onConflict: 'id' });
  if (error) {
    if (error.message?.includes('is_demo')) {
      throw new Error(
        'The users.is_demo column is missing. Apply migration ' +
          '20260912000001_add_demo_accounts.sql to this database first.'
      );
    }
    throw error;
  }
  console.log('• Marked account as a demo account (users.is_demo = true)');
}

/** AI features are the point of this account, so opt it in explicitly. */
async function ensureAiEnabled(userId: string): Promise<void> {
  const { data } = await admin
    .from('user_preferences')
    .select('preferences')
    .eq('user_id', userId)
    .maybeSingle();

  const preferences = { ...(data?.preferences || {}), ai_enabled: true };
  const { error } = await admin
    .from('user_preferences')
    .upsert({ user_id: userId, preferences }, { onConflict: 'user_id' });
  if (error) throw error;
  console.log('• AI processing enabled for the account');
}

/**
 * Mint an access token for the demo account.
 *
 * An admin-generated magic link is exchanged for a session without sending mail
 * or knowing a password, which is what lets this script call the demo routes as
 * the account itself.
 */
async function mintAccessToken(email: string): Promise<string> {
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (error || !data?.properties?.hashed_token) {
    throw error || new Error('Could not generate a sign-in token for the demo account');
  }

  const { data: session, error: verifyError } = await publicClient.auth.verifyOtp({
    token_hash: data.properties.hashed_token,
    type: 'magiclink',
  });
  if (verifyError || !session.session?.access_token) {
    throw verifyError || new Error('Could not exchange the demo sign-in token for a session');
  }
  return session.session.access_token;
}

// ─── Seeding over HTTP ─────────────────────────────────────────────────────

async function callSeed(apiUrl: string, token: string, reset: boolean): Promise<void> {
  const endpoint = `${apiUrl}/demo/${reset ? 'reset' : 'seed'}`;
  console.log(`• ${reset ? 'Resetting' : 'Seeding'} via ${endpoint}`);

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });

  const body = await response.text();
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(
        `The API returned 404. That means the server is not running with DEMO_MODE_ENABLED=true, ` +
          `or it is pointed at a different database than this script. API: ${apiUrl}`
      );
    }
    throw new Error(`Seed request failed (${response.status}): ${body}`);
  }

  const result = JSON.parse(body) as {
    seededMessages: number;
    chats: number;
    suggestionsRequested: number;
    loopDetectionScheduled: number;
  };
  console.log(
    `• Seeded ${result.seededMessages} messages across ${result.chats} chats ` +
      `(${result.suggestionsRequested} suggestions, ${result.loopDetectionScheduled} chats queued for loop detection)`
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs();
  const summary = demoFixtureSummary();

  console.log('');
  console.log('Claire demo account');
  console.log(`  email     ${args.email}`);
  console.log(`  api       ${args.apiUrl}`);
  console.log(`  database  ${supabaseConfig.url}`);
  console.log(`  fixtures  ${summary.personas} people, ${summary.chats} chats, ${summary.messages} messages`);
  console.log(`  mode      ${args.reset ? 'reset (wipe then seed)' : 'seed (idempotent)'}`);
  console.log('');

  const userId = await ensureAuthUser(args.email);
  await ensureDemoProfile(userId, args.email, args.name);
  await ensureAiEnabled(userId);
  const token = await mintAccessToken(args.email);
  await callSeed(args.apiUrl, token, args.reset);

  console.log('');
  console.log('Done. Sign in on the client with this address and request an email code.');
  console.log('Loop detection and the Ask Claire index finish in the background —');
  console.log('give it a minute before filming, then check GET /demo/status.');
  console.log('');
}

main().catch((error) => {
  console.error('');
  console.error(`Demo seed failed: ${error instanceof Error ? error.message : String(error)}`);
  console.error('');
  process.exit(1);
});
