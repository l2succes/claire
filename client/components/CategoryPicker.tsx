import { Pressable, ScrollView, Text, View } from 'react-native';
import { Briefcase, Heart, Plane, UserRound, UsersRound, type LucideIcon } from 'lucide-react-native';
import { colors, mobileType, radius, space } from '@claire/design-system';
import type { ChatCategory } from '../types/conversationSettings';

const CATEGORIES: Array<{ key: ChatCategory; label: string; Icon: LucideIcon; color: string }> = [
  { key: 'personal', label: 'Personal', Icon: UserRound, color: colors.neutral[600] },
  { key: 'friend', label: 'Friend', Icon: UsersRound, color: '#3B82F6' },
  { key: 'business', label: 'Business', Icon: Briefcase, color: '#8B5CF6' },
  { key: 'trip', label: 'Trip', Icon: Plane, color: '#10B981' },
  { key: 'romantic', label: 'Romantic', Icon: Heart, color: '#EC4899' },
];

interface CategoryPickerProps {
  selected: ChatCategory | null;
  onSelect: (category: ChatCategory) => void;
}

/** The relationship picker deliberately preserves the familiar category icons. */
export function CategoryPicker({ selected, onSelect }: CategoryPickerProps) {
  return (
    <View style={{ gap: space[2] }}>
      <Text maxFontSizeMultiplier={1} style={{ ...mobileType.monoLabel, color: colors.neutral[800] }}>
        WHAT KIND OF RELATIONSHIP IS THIS?
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[2], paddingRight: space[4] }}>
        {CATEGORIES.map(({ key, label, Icon, color }) => {
          const isSelected = selected === key;
          return (
            <Pressable key={key} accessibilityRole="button" accessibilityState={{ selected: isSelected }} accessibilityLabel={`${label} relationship`} onPress={() => onSelect(key)}>
              <View style={{ minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, borderRadius: radius.pill, borderCurve: 'continuous', borderWidth: 1, borderColor: isSelected ? colors.ink : colors.neutral[200], backgroundColor: isSelected ? colors.ink : colors.paper }}>
                <Icon size={17} strokeWidth={2.2} color={isSelected ? colors.lime : color} />
                <Text maxFontSizeMultiplier={1} style={{ ...mobileType.label, color: isSelected ? colors.paper : colors.ink }}>{label}</Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
