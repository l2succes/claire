import { requireOptionalNativeModule } from 'expo';

type Result = { success: boolean; cancelled?: boolean; sessionId?: string; error?: string };
type InstagramLogin = { start(apiURL: string, accessToken: string): Promise<Result> };

const native = process.env.EXPO_OS === 'ios'
  ? requireOptionalNativeModule<InstagramLogin>('InstagramLogin') : null;

export const hasInstagramMobileLogin = Boolean(native) && process.env.EXPO_PUBLIC_INSTAGRAM_MOBILE_LOGIN === 'true';

/** Only Claire's token goes in and a sanitized outcome comes out. Instagram secrets stay native. */
export async function startInstagramMobileLogin(apiURL: string, accessToken: string): Promise<Result> {
  if (!hasInstagramMobileLogin || !native) return { success: false, error: 'Mobile sign-in is not available in this build.' };
  return native.start(apiURL, accessToken);
}
