import { View, Text, TouchableOpacity } from 'react-native';
import { User, Briefcase, Users, Heart, X } from 'lucide-react-native';

export type RelationshipType = 'colleague' | 'friend' | 'family' | 'romantic' | 'other';

interface RelationshipOption {
  label: string;
  value: RelationshipType;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Icon: (props: { size: number; color: string }) => any;
  color: string;
}

const OPTIONS: RelationshipOption[] = [
  { label: 'Colleague', value: 'colleague', Icon: Briefcase, color: '#8b5cf6' },
  { label: 'Friend', value: 'friend', Icon: Users, color: '#3b82f6' },
  { label: 'Family', value: 'family', Icon: Heart, color: '#ec4899' },
  { label: 'Other', value: 'other', Icon: User, color: '#6b7280' },
];

interface ContactClarificationCardProps {
  contactName: string;
  onSelect: (relationship: RelationshipType) => void;
  onDismiss: () => void;
}

export function ContactClarificationCard({
  contactName,
  onSelect,
  onDismiss,
}: ContactClarificationCardProps) {
  return (
    <View
      testID="contact-clarification-card"
      style={{
        marginHorizontal: 12,
        marginBottom: 8,
        borderRadius: 16,
        backgroundColor: '#f9fafb',
        borderWidth: 1,
        borderColor: '#e5e7eb',
        padding: 14,
      }}
    >
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
        <View style={{ flex: 1 }}>
          <Text
            style={{ fontSize: 14, fontWeight: '600', color: '#111827' }}
            numberOfLines={1}
            testID="contact-clarification-prompt"
          >
            Who is {contactName}?
          </Text>
          <Text style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
            Help Claire personalise replies
          </Text>
        </View>
        <TouchableOpacity
          onPress={onDismiss}
          testID="contact-clarification-dismiss"
          style={{ padding: 4 }}
        >
          <X size={16} color="#9ca3af" />
        </TouchableOpacity>
      </View>

      {/* Options */}
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        {OPTIONS.map(({ label, value, Icon, color }) => (
          <TouchableOpacity
            key={value}
            testID={`contact-clarification-option-${value}`}
            onPress={() => onSelect(value)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: 20,
              backgroundColor: '#ffffff',
              borderWidth: 1,
              borderColor: '#e5e7eb',
            }}
          >
            <Icon size={13} color={color} />
            <Text style={{ fontSize: 13, color: '#374151', fontWeight: '500' }}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}
