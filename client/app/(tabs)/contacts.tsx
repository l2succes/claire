import { View, Text, FlatList, TouchableOpacity, Image, TextInput } from 'react-native';
import { useState, useEffect } from 'react';
import { Search, User } from 'lucide-react-native';
import { supabase } from '../../services/supabase';
import { useAuthStore } from '../../stores/authStore';

interface Contact {
  id: string;
  name: string;
  phone_number: string;
  avatar_url?: string;
  inferred_name?: string;
  inferred_relationship?: string;
  is_group: boolean;
  last_message?: string;
  last_message_at?: string;
}

export default function ContactsScreen() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [, setLoading] = useState(true);
  const user = useAuthStore((state) => state.user);

  useEffect(() => {
    fetchContacts();
  }, []);

  const fetchContacts = async () => {
    if (!user?.id) return;

    try {
      const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .eq('user_id', user.id)
        .order('name', { ascending: true });

      if (error) throw error;
      setContacts(data || []);
    } catch (error) {
      console.error('Error fetching contacts:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredContacts = contacts.filter(contact => {
    const searchLower = searchQuery.toLowerCase();
    const name = (contact.name || contact.inferred_name || '').toLowerCase();
    const phone = contact.phone_number?.toLowerCase() || '';
    return name.includes(searchLower) || phone.includes(searchLower);
  });

  const renderContact = ({ item }: { item: Contact }) => (
    <TouchableOpacity className="flex-row items-center p-4 bg-white dark:bg-gray-800 mb-1">
      <View className="w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-700 items-center justify-center mr-3">
        {item.avatar_url ? (
          <Image source={{ uri: item.avatar_url }} className="w-12 h-12 rounded-full" />
        ) : (
          <User size={24} color="#6b7280" />
        )}
      </View>
      <View className="flex-1">
        <Text className="text-base font-semibold text-gray-900 dark:text-white">
          {item.name || item.inferred_name || item.phone_number}
        </Text>
        {item.inferred_relationship && (
          <Text className="text-sm text-gray-500 dark:text-gray-400">
            {item.inferred_relationship}
          </Text>
        )}
        {item.last_message && (
          <Text className="text-sm text-gray-600 dark:text-gray-300 mt-1" numberOfLines={1}>
            {item.last_message}
          </Text>
        )}
      </View>
      {item.is_group && (
        <View className="px-2 py-1 bg-blue-100 dark:bg-blue-900 rounded">
          <Text className="text-xs text-blue-600 dark:text-blue-300">Group</Text>
        </View>
      )}
    </TouchableOpacity>
  );

  return (
    <View className="flex-1 bg-gray-50 dark:bg-gray-900">
      {/* Search Bar */}
      <View className="bg-white dark:bg-gray-800 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <View className="flex-row items-center bg-gray-100 dark:bg-gray-700 rounded-lg px-3 py-2">
          <Search size={20} color="#6b7280" />
          <TextInput
            className="flex-1 ml-2 text-gray-900 dark:text-white"
            placeholder="Search contacts..."
            placeholderTextColor="#6b7280"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      </View>

      {/* Contacts List */}
      <FlatList
        data={filteredContacts}
        renderItem={renderContact}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingVertical: 8 }}
        ListEmptyComponent={
          <View className="flex-1 items-center justify-center py-20">
            <User size={48} color="#9ca3af" />
            <Text className="text-gray-500 dark:text-gray-400 mt-4">
              {searchQuery ? 'No contacts found' : 'No contacts yet'}
            </Text>
          </View>
        }
      />
    </View>
  );
}