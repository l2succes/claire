import { Pressable, Text, View } from 'react-native';
import { Search } from 'lucide-react-native';
import { colors, mobileType, space } from '@claire/design-system';

export function InboxSearchAction({ query, onSearch }: { query: string; onSearch: (query: string) => void }) {
  const term = query.trim();
  if (!term) return null;

  return (
    <Pressable
      testID="inbox-search-everything"
      accessibilityRole="button"
      accessibilityLabel={`Search everything for ${term}`}
      onPress={() => onSearch(term)}
      style={{ minHeight: 72, padding: space[4], flexDirection: 'row', alignItems: 'center', gap: space[3], borderTopWidth: 1, borderTopColor: colors.neutral[200] }}
    >
      <Search size={20} color={colors.ink} />
      <View style={{ flex: 1, gap: 4 }}>
        <Text numberOfLines={2} style={{ ...mobileType.body, color: colors.ink }}>Search everything for “{term}”</Text>
        <Text style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>Messages, people, files, loops</Text>
      </View>
    </Pressable>
  );
}
