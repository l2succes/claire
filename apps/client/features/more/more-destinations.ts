import { Link2, Search, Settings, UsersRound, type LucideIcon } from 'lucide-react-native';

export interface MoreDestination {
  key: string;
  title: string;
  detail: string;
  icon: LucideIcon;
  href: string;
}

export const MORE_DESTINATIONS: MoreDestination[] = [
  { key: 'search', title: 'Search', detail: 'Messages, people, files, and loops', icon: Search, href: '/(tabs)/search' },
  { key: 'people', title: 'People', detail: 'Contacts and relationship context', icon: UsersRound, href: '/(tabs)/contacts' },
  { key: 'connections', title: 'Connections', detail: 'Messaging accounts and setup', icon: Link2, href: '/(tabs)/connections' },
  { key: 'settings', title: 'Settings', detail: 'Notifications, AI, and account controls', icon: Settings, href: '/(tabs)/settings' },
];
