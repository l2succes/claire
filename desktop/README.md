# Claire Desktop

Claire Desktop is a full messaging client with a companion-agent capability.

## Runtime configuration

Signed Mac builds receive `CLAIRE_API_URL`, `CLAIRE_SUPABASE_URL`, and
`CLAIRE_SUPABASE_ANON_KEY` as Xcode build settings. Use
[`macos/ClaireDesktop.xcconfig.example`](./macos/ClaireDesktop.xcconfig.example)
as the CI/build configuration template. The app stores its authenticated
Supabase session and companion credential in macOS Keychain; neither belongs in
the bundle or a `.env` file.
The first host is React Native macOS; React Native Windows will use the same
product contracts and shared design system once its compatibility spike is complete.

## macOS development

```bash
cd desktop/macos
npm install
npm run pods
npm run macos
```

The Mac host intentionally uses its own supported React Native / React Native
macOS pair. Shared product code belongs in `packages/`; native code remains
behind host-specific interfaces.
