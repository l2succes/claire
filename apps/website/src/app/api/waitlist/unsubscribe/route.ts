// SPDX-License-Identifier: Apache-2.0
import { getWebsiteSupabaseClient } from '@/lib/waitlist';

export const runtime = 'nodejs';

function page(title: string, body: string, token?: string) {
  const action = token
    ? `<form method="post"><input type="hidden" name="token" value="${token.replace(/[^a-f0-9-]/gi, '')}"><button type="submit">Unsubscribe</button></form>`
    : '';
  return new Response(
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title} — Claire</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f4f1ea;color:#10120f;font-family:Arial,sans-serif}.card{width:min(520px,calc(100% - 48px));padding:40px;border:1px solid #10120f;border-radius:24px;background:#fffdf8;box-shadow:7px 7px 0 #dfff64}small{font:700 11px ui-monospace,monospace;letter-spacing:.12em}h1{font-size:38px;letter-spacing:-.04em}p{color:#62645f;line-height:1.6}button{margin-top:12px;padding:14px 22px;border:0;border-radius:999px;background:#10120f;color:white;font-weight:700;cursor:pointer}</style><body><main class="card"><small>CLAIRE BUILD NOTES</small><h1>${title}</h1><p>${body}</p>${action}</main></body></html>`,
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token');
  if (!token || !/^[a-f0-9-]{36}$/i.test(token)) {
    return page('That link is not valid.', 'No changes were made.');
  }
  return page(
    'Leave the build list?',
    'You will stop receiving Claire launch notes. You can join again from the website anytime.',
    token,
  );
}

export async function POST(request: Request) {
  const urlToken = new URL(request.url).searchParams.get('token');
  const contentType = request.headers.get('content-type') ?? '';
  let token = urlToken;
  let isOneClick = false;

  if (contentType.includes('form')) {
    const fields = new URLSearchParams(await request.text());
    token = token ?? fields.get('token');
    isOneClick = fields.get('List-Unsubscribe') === 'One-Click';
  }

  if (!token || !/^[a-f0-9-]{36}$/i.test(token)) {
    return page('That link is not valid.', 'No changes were made.');
  }

  const supabase = getWebsiteSupabaseClient();
  if (!supabase) return page('Please try again later.', 'We could not update your preference just now.');

  const now = new Date().toISOString();
  const { error } = await supabase
    .from('waitlist_subscribers')
    .update({ status: 'unsubscribed', unsubscribed_at: now, updated_at: now })
    .eq('unsubscribe_token', token);

  if (error) {
    console.error('Waitlist unsubscribe failed', error.message);
    return page('Please try again later.', 'We could not update your preference just now.');
  }

  return isOneClick
    ? new Response(null, { status: 200 })
    : page('You’re unsubscribed.', 'You will not receive any more Claire build notes.');
}
