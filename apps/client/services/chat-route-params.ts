import { resolvePlatform } from '../types/platform';

type RouteValue = string | string[] | undefined;

/** `platform` is reserved by Expo's web server. New links use chatPlatform;
 * keep reading the old hint for existing native notification/deep links. */
export function readChatPlatform(params: { chatPlatform?: RouteValue; platform?: RouteValue }) {
  const first = (value: RouteValue) => (Array.isArray(value) ? value[0] : value)?.trim();
  return resolvePlatform(first(params.chatPlatform)) ?? resolvePlatform(first(params.platform));
}
