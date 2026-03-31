import { Tabs, Redirect } from 'expo-router';
import {
  Sparkles,
  MessageCircle,
  CheckSquare,
  Settings,
  Users,
} from 'lucide-react-native';
import { useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '../../stores/authStore';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isDark = colorScheme === 'dark';
  const { bottom } = useSafeAreaInsets();

  if (!isAuthenticated) {
    return <Redirect href="/(auth)/login" />;
  }

  const activeColor = isDark ? '#818cf8' : '#6366f1';
  const inactiveColor = isDark ? '#6b7280' : '#9ca3af';

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: activeColor,
        tabBarInactiveTintColor: inactiveColor,
        tabBarStyle: {
          backgroundColor: isDark ? '#111827' : '#ffffff',
          borderTopColor: isDark ? '#1f2937' : '#e5e7eb',
          borderTopWidth: 1,
          paddingBottom: bottom + 5,
          paddingTop: 5,
          height: 60 + bottom,
        },
        headerStyle: {
          backgroundColor: isDark ? '#111827' : '#ffffff',
        },
        headerTintColor: isDark ? '#f3f4f6' : '#111827',
        headerShadowVisible: false,
        headerTitleStyle: {
          fontWeight: '600',
        },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => (
            <Sparkles size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: 'Messages',
          tabBarIcon: ({ color, size }) => (
            <MessageCircle size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="contacts"
        options={{
          title: 'Contacts',
          tabBarIcon: ({ color, size }) => (
            <Users size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="promises"
        options={{
          title: 'Promises',
          tabBarIcon: ({ color, size }) => (
            <CheckSquare size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => (
            <Settings size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}