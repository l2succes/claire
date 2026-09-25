type PaywallSource = string | string[] | undefined;

function sourceValue(source: PaywallSource) {
  return Array.isArray(source) ? source[0] : source;
}

export function paywallHeaderMode(source: PaywallSource): 'onboarding' | 'profile' | 'modal' {
  if (sourceValue(source) === 'settings') return 'profile';
  return sourceValue(source) === 'onboarding' ? 'onboarding' : 'modal';
}

export function paywallExitAction(
  source: PaywallSource,
  canGoBack: boolean,
): 'back' | '/settings' | '/(tabs)/dashboard' {
  if (sourceValue(source) === 'settings') return canGoBack ? 'back' : '/settings';
  return '/(tabs)/dashboard';
}
