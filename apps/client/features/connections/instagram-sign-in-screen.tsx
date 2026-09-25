import { useCallback, useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, mobileType, space } from '@claire/design-system';
import {
  InstagramLoginNativeView,
  type InstagramLoginResult,
} from '../../modules/instagram-login';
import { API_BASE_URL } from '../../services/platforms';
import { supabase } from '../../services/supabase';
import { usePlatformStore } from '../../stores/platformStore';
import { FlowHeader } from './connection-flow-screen';

/** A pushed step in Claire's existing modal stack. Instagram credentials stay in UIKit. */
export function InstagramSignInScreen() {
  const insets = useSafeAreaInsets();
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelRequested, setCancelRequested] = useState(false);
  const handledResult = useRef(false);

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (data.session?.access_token) setAccessToken(data.session.access_token);
      else setError('Sign in to Claire again to connect Instagram.');
    }).catch(() => {
      if (active) setError('Claire could not open Instagram sign-in. Try again.');
    });
    return () => { active = false; };
  }, []);

  const goBack = useCallback(() => {
    if (!accessToken || !InstagramLoginNativeView) router.back();
    else setCancelRequested(true);
  }, [accessToken]);

  const onResult = useCallback(async (event: { nativeEvent: InstagramLoginResult }) => {
    if (handledResult.current) return;
    handledResult.current = true;
    if (event.nativeEvent.success) {
      try {
        await usePlatformStore.getState().fetchConnectedSessions();
      } finally {
        router.back();
      }
      return;
    }
    router.back();
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.cream }} testID="instagram-sign-in-route">
      <FlowHeader title="Instagram sign-in" topInset={insets.top} compact backLabel="Back to Connect Instagram" onBack={goBack} />
      {accessToken && InstagramLoginNativeView ? (
        <InstagramLoginNativeView
          style={{ flex: 1 }}
          apiURL={API_BASE_URL}
          accessToken={accessToken}
          cancelRequested={cancelRequested}
          onResult={onResult}
        />
      ) : (
        <View style={{ flex: 1, paddingHorizontal: space[4], paddingTop: space[5] }}>
          <Text style={{ ...mobileType.body, color: error ? colors.danger : colors.neutral[600] }}>
            {error || 'Opening Instagram sign-in…'}
          </Text>
        </View>
      )}
    </View>
  );
}
