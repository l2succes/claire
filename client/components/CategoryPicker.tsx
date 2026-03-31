import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { User, Users, Briefcase, Plane, Heart } from 'lucide-react-native';
import type { ChatCategory } from '../types/conversationSettings';

const CATEGORIES: Array<{ key: ChatCategory; label: string; Icon: typeof User; color: string }> = [
  { key: 'personal', label: 'Personal', Icon: User, color: '#6b7280' },
  { key: 'friend', label: 'Friend', Icon: Users, color: '#3b82f6' },
  { key: 'business', label: 'Business', Icon: Briefcase, color: '#8b5cf6' },
  { key: 'trip', label: 'Trip', Icon: Plane, color: '#10b981' },
  { key: 'romantic', label: 'Romantic', Icon: Heart, color: '#ef4444' },
];

interface CategoryPickerProps {
  selected: ChatCategory | null;
  onSelect: (category: ChatCategory) => void;
}

export function CategoryPicker({ selected, onSelect }: CategoryPickerProps) {
  return (
    <View style={{ paddingVertical: 12 }}>
      <Text style={{ fontSize: 13, fontWeight: '600', color: '#6b7280', marginBottom: 8, paddingHorizontal: 16 }}>
        Conversation Type
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 12, gap: 8 }}
      >
        {CATEGORIES.map(({ key, label, Icon, color }) => {
          const isSelected = selected === key;
          return (
            <TouchableOpacity
              key={key}
              onPress={() => onSelect(key)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 20,
                backgroundColor: isSelected ? color : '#f3f4f6',
                borderWidth: 1,
                borderColor: isSelected ? color : '#e5e7eb',
                gap: 6,
              }}
            >
              <Icon size={16} color={isSelected ? '#ffffff' : color} />
              <Text style={{
                fontSize: 13,
                fontWeight: '600',
                color: isSelected ? '#ffffff' : '#374151',
              }}>
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}
