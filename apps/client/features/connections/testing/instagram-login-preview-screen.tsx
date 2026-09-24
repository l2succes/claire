import { useState } from 'react';
import { Button, Text, View } from 'react-native';
import { hasInstagramMobileLogin, startInstagramMobileLogin } from '../../../modules/instagram-login';

/** Local Simulator harness. Live mode talks to the isolated local Matrix bridge. */
export function InstagramLoginPreviewScreen() {
  const [outcome, setOutcome] = useState('');
  const live = process.env.EXPO_PUBLIC_INSTAGRAM_LOGIN_LIVE_PREVIEW === 'true';
  if (!__DEV__ || (!live && process.env.EXPO_PUBLIC_INSTAGRAM_LOGIN_PREVIEW !== 'true')) return null;
  return <View style={{ flex: 1, padding: 30, paddingTop: 100, gap: 20 }}>
    <Text style={{ fontSize: 24 }}>{live ? 'Live Instagram bridge test' : 'Synthetic Instagram login test'}</Text>
    <Text>{live
      ? 'Sign in to Instagram yourself. This uses a local test bridge; it will verify authentication, but does not import conversations into Claire yet.'
      : 'Do not enter real credentials. Use username “fixture”, password “fixture” and code “123456”.'}</Text>
    <Button title={live ? 'Open real Instagram sign-in' : 'Open synthetic sign-in'} disabled={!hasInstagramMobileLogin} onPress={async () => {
      try { setOutcome(JSON.stringify(await startInstagramMobileLogin('http://127.0.0.1:3309', live ? 'local-live-instagram' : 'synthetic-fixture'))); }
      catch { setOutcome('Native sign-in could not open.'); }
    }} />
    <Text accessibilityLabel="Instagram login outcome">{outcome}</Text>
  </View>;
}
