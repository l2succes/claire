/**
 * The Tamagui compiler resolves its configuration from this path (see the
 * `config` option in babel.config.js). The configuration itself lives in
 * `@claire/design-system` so every client — Expo, browser, and the Electron
 * desktop shell — shares one set of tokens and breakpoints.
 */
import { claireConfig } from '@claire/design-system';

export default claireConfig;
