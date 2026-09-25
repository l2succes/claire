# Welcome motion

The welcome screen keeps “All your chats, one AI.” and the authentication actions
in place while a three-scene carousel introduces Claire. The uploaded Granola
clip informed the stable controls and changing pastel scenes; this is an original
Claire treatment, not a measured reproduction of its timing.

- **Together:** four supported platform marks float around Claire. A six-second
  sine cycle moves each tile by at most four points, with staggered phases.
- **Catch up:** swiping gathers the tiles into a compact row and reveals an
  illustrative summary card. Sky transitions to mint.
- **Follow through:** a saved follow-up card replaces the summary. Mint transitions
  to lavender.

Scroll position drives color, translation, rotation, opacity, and scale on the
Reanimated UI thread. Native paging supplies gesture settling; there is no
carousel autoplay or forced delay before signing in. Arrows and 44-point page
buttons provide alternatives to swiping. Artwork is decorative; accessible
headings and descriptions communicate each scene.

The welcome content enters over 320 ms, staggered by 60 ms. Email screens reuse
that short reveal for their heading and form; connection groups enter at 100 ms
and 160 ms. These transitions do not change authentication or pairing behavior.

Reduce Motion stops the repeating drift and makes button-driven scene changes
immediate. Motion pauses when the app is backgrounded or the screen loses focus.
Readable content follows Dynamic Type and the screen scrolls at larger sizes;
text embedded in the decorative card illustrations stays at its designed scale.

The old welcome screen remains in `features/auth/legacy-signin-screen.tsx`.
Changing the export in `app/(auth)/signin.tsx` restores it.
