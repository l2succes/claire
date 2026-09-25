import { registerRootComponent } from 'expo';
import * as SplashScreen from 'expo-splash-screen';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { view } from './storybook.requires';

/**
 * This file is user-editable.
 *
 * Use it as your React Native Storybook entrypoint and wrap `StorybookUIRoot`
 * with application decorators/providers (theme, i18n, state, navigation, etc).
 */
const StorybookUIRoot = view.getStorybookUI({
  initialSelection: process.env.EXPO_PUBLIC_STORYBOOK_STORY ?? 'onboarding-flow--complete-walkthrough',
  shouldPersistSelection: false,
  storage: {
    getItem: AsyncStorage.getItem,
    setItem: AsyncStorage.setItem,
  },
});

registerRootComponent(StorybookUIRoot);
void SplashScreen.hideAsync();
