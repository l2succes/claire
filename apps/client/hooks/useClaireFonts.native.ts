/**
 * Native already has the families.
 *
 * The expo-font config plugin in app.json embeds Public Sans, Inter, and
 * DM Mono into the app bundle at build time, so there is nothing to load at
 * runtime and no window where text would render in a fallback face.
 */
export function useClaireFonts(): boolean {
  return true;
}
