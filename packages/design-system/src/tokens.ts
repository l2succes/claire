/**
 * Token re-exports.
 *
 * The values themselves now live in `@claire/tokens`, which is also what the
 * marketing site's CSS variables are generated from. This module stays so the
 * many screens that import tokens from `@claire/design-system` keep working.
 */

import { compactType, type as desktopType, type ClaireTextVariant } from '@claire/tokens';

export {
  breakpoints,
  colors,
  compactType,
  fonts,
  radius,
  space,
  type,
  type ClaireAvatarTone,
  type ClaireTextVariant,
} from '@claire/tokens';

/**
 * @deprecated Use the `variant` prop on `ClaireText`, which carries its own
 * `$compact` overrides. This flattened scale exists only for screens still
 * writing inline `StyleSheet` objects, and goes away as they move to
 * `@claire/ui` components.
 */
export const mobileType = Object.fromEntries(
  (Object.keys(desktopType) as ClaireTextVariant[]).map((key) => [
    key,
    { ...desktopType[key], ...(compactType as Partial<Record<ClaireTextVariant, object>>)[key] },
  ]),
) as Record<ClaireTextVariant, (typeof desktopType)[ClaireTextVariant]>;
