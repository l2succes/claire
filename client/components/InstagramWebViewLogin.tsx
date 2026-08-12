// Instagram rejects or fails to load reliably in embedded mobile webviews.
// Keep the native and web paths identical: credentials are sent directly to
// Claire over TLS, which completes the already-started mautrix login flow.
export { InstagramWebViewLogin } from './InstagramWebViewLogin.web';
