import { useState, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import { Pencil } from 'lucide-react-native';

interface EditableFieldProps {
  label: string;
  value: string | null;
  placeholder: string;
  onSave: (value: string) => void;
  keyboardType?: 'default' | 'email-address' | 'phone-pad';
  multiline?: boolean;
}

export function EditableField({ label, value, placeholder, onSave, keyboardType = 'default', multiline = false }: EditableFieldProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [text, setText] = useState(value || '');
  const inputRef = useRef<TextInput>(null);

  const handlePress = () => {
    setIsEditing(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleBlur = () => {
    setIsEditing(false);
    const trimmed = text.trim();
    if (trimmed !== (value || '')) {
      onSave(trimmed);
    }
  };

  return (
    <View style={{
      flexDirection: 'row',
      alignItems: multiline ? 'flex-start' : 'center',
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: '#f3f4f6',
    }}>
      <View style={{ width: 80 }}>
        <Text style={{ fontSize: 13, color: '#6b7280', fontWeight: '500' }}>{label}</Text>
      </View>
      <View style={{ flex: 1 }}>
        {isEditing ? (
          <TextInput
            ref={inputRef}
            style={{ fontSize: 15, color: '#111827', padding: 0 }}
            value={text}
            onChangeText={setText}
            onBlur={handleBlur}
            placeholder={placeholder}
            placeholderTextColor="#9ca3af"
            keyboardType={keyboardType}
            multiline={multiline}
            maxLength={multiline ? 1500 : undefined}
            textAlignVertical={multiline ? 'top' : undefined}
            numberOfLines={multiline ? 4 : undefined}
            returnKeyType="done"
            onSubmitEditing={handleBlur}
          />
        ) : (
          <TouchableOpacity onPress={handlePress} style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{
              fontSize: 15,
              color: value ? '#111827' : '#9ca3af',
              flex: 1,
            }}>
              {value || placeholder}
            </Text>
            <Pencil size={14} color="#9ca3af" />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}
