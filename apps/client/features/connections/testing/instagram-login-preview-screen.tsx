import { useState } from 'react';
import { Button, Text, View } from 'react-native';
import { hasInstagramMobileLogin, startInstagramMobileLogin } from '../../../modules/instagram-login';

/** Local Simulator harness. No real token, account, or bridge connection is used. */
export function InstagramLoginPreviewScreen() {
  const [outcome, setOutcome] = useState('');
  if (!__DEV__ || process.env.EXPO_PUBLIC_INSTAGRAM_LOGIN_PREVIEW !== 'true') return null;
  return <View style={{ flex: 1, padding: 30, paddingTop: 100, gap: 20 }}>
    <Text style={{ fontSize: 24 }}>Synthetic Instagram login test</Text>
    <Text>Do not enter real credentials. Use username “fixture”, password “fixture” and code “123456”.</Text>
    <Button title="Open synthetic sign-in" disabled={!hasInstagramMobileLogin} onPress={async () => {
      try { setOutcome(JSON.stringify(await startInstagramMobileLogin('http://127.0.0.1:3309', 'synthetic-fixture'))); }
      catch { setOutcome('Native sign-in could not open.'); }
    }} />
    <Text accessibilityLabel="Synthetic login outcome">{outcome}</Text>
  </View>;
}
