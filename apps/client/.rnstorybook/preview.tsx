import type { Preview } from '@storybook/react-native';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ClaireThemeProvider, colors } from '@claire/design-system';

const preview: Preview = {
  decorators: [
    (Story) => (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <ClaireThemeProvider surface="mobile">
            <View style={{ flex: 1, backgroundColor: colors.cream }}>
              <Story />
            </View>
          </ClaireThemeProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    ),
  ],
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/,
      },
    },
    options: {
      storySort: {
        order: ['Onboarding', ['Flow', 'Screens', 'States']],
      },
    },
  },
};

export default preview;
