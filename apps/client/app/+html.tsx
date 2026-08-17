import { ScrollViewStyleReset } from 'expo-router/html';

/**
 * The web/Electron HTML shell.
 *
 * Fonts are not declared here. Their served URLs are content-hashed by Metro,
 * so they cannot be written as static paths — hooks/useClaireFonts.web.ts
 * resolves them through expo-asset and registers the faces at runtime.
 */
export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />

        <ScrollViewStyleReset />

        <style dangerouslySetInnerHTML={{ __html: baseStyles }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

/**
 * `overscroll-behavior: none` matters specifically in Electron: without it the
 * window rubber-bands on macOS as if it were a web page, which immediately
 * reads as "this is a browser" rather than an application.
 */
const baseStyles = `
body {
  background-color: #F4F1EA;
  overscroll-behavior: none;
}
#root {
  display: flex;
  min-height: 100%;
}
`;
