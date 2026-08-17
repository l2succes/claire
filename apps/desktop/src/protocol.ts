import { net, protocol } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * The packaged renderer is served from a custom scheme rather than `file://`.
 *
 * This is not cosmetic. The Claire client persists its Supabase session through
 * AsyncStorage, which is `localStorage` on web. Under `file://` the page gets an
 * opaque origin, where `localStorage` is unreliable or throws outright — so a
 * signed-in user would be signed out again on every relaunch. Registering the
 * scheme as `standard` + `secure` gives the renderer a stable, secure origin,
 * which also makes `fetch` to the Claire API and Supabase behave normally.
 *
 * `claire-app://` is deliberately distinct from `claire://`, which is already
 * the Expo app's deep-link scheme (see apps/client/app.json) and is reserved
 * here for OAuth callbacks via `app.setAsDefaultProtocolClient`.
 */
export const RENDERER_SCHEME = 'claire-app';
export const RENDERER_ORIGIN = `${RENDERER_SCHEME}://app`;

export function registerRendererSchemePrivileges(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: RENDERER_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
      },
    },
  ]);
}

/**
 * Serve the `expo export -p web` output, falling back to `index.html` for any
 * path that is not a real file so expo-router can handle client-side routes.
 */
export function registerRendererProtocol(rendererRoot: string): void {
  protocol.handle(RENDERER_SCHEME, async (request) => {
    const requestUrl = new URL(request.url);
    const relativePath = decodeURIComponent(requestUrl.pathname).replace(/^\/+/, '');

    const resolved = resolveWithinRoot(rendererRoot, relativePath);
    if (resolved) {
      return net.fetch(pathToFileURL(resolved).toString());
    }

    // SPA fallback. Works for both `single` and `static` expo-router output,
    // because the client router takes over once index.html boots.
    const indexHtml = path.join(rendererRoot, 'index.html');
    if (fs.existsSync(indexHtml)) {
      return net.fetch(pathToFileURL(indexHtml).toString());
    }

    return new Response('Renderer bundle not found. Run `bun run bundle:renderer`.', {
      status: 404,
      headers: { 'content-type': 'text/plain' },
    });
  });
}

/**
 * Resolve a request path to a real file inside `root`, or return null.
 *
 * Rejects anything that escapes the renderer directory so a crafted request
 * cannot read arbitrary files off disk.
 */
function resolveWithinRoot(root: string, relativePath: string): string | null {
  if (!relativePath) return null;

  const candidate = path.resolve(root, relativePath);
  const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;
  if (!candidate.startsWith(rootWithSep)) return null;

  if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
    return candidate;
  }
  return null;
}
