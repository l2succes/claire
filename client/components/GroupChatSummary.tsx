import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useState, useEffect } from 'react';
import { Users, ChevronDown, ChevronUp } from 'lucide-react-native';
import { API_BASE_URL } from '../services/platforms';
import { useAuthStore } from '../stores/authStore';

interface GroupChatSummaryProps {
  chatId: string;
}

export function GroupChatSummary({ chatId }: GroupChatSummaryProps) {
  const token = useAuthStore((state) => state.token);
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (expanded && !summary && !loading) {
      fetchSummary();
    }
  }, [expanded]);

  const fetchSummary = async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(`${API_BASE_URL}/api/ai/group-summary/${encodeURIComponent(chatId)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      if (json.success && json.data?.summary) {
        setSummary(json.data.summary);
      } else {
        throw new Error('Invalid response');
      }
    } catch {
      setError('Could not load summary.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View
      testID="group-chat-summary"
      style={{
        backgroundColor: '#f0fdf4',
        borderTopWidth: 1,
        borderTopColor: '#d1fae5',
        paddingHorizontal: 16,
        paddingVertical: 10,
      }}
    >
      <TouchableOpacity
        onPress={() => setExpanded((v) => !v)}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
        testID="group-chat-summary-toggle"
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Users size={16} color="#10b981" />
          <Text style={{ fontSize: 13, fontWeight: '600', color: '#065f46' }}>
            Group Summary
          </Text>
        </View>
        {expanded ? (
          <ChevronUp size={16} color="#6b7280" />
        ) : (
          <ChevronDown size={16} color="#6b7280" />
        )}
      </TouchableOpacity>

      {expanded && (
        <View style={{ marginTop: 8 }} testID="group-chat-summary-content">
          {loading ? (
            <ActivityIndicator size="small" color="#10b981" testID="group-chat-summary-loading" />
          ) : error ? (
            <Text style={{ fontSize: 13, color: '#dc2626' }} testID="group-chat-summary-error">
              {error}
            </Text>
          ) : summary ? (
            <Text
              style={{ fontSize: 13, color: '#374151', lineHeight: 19 }}
              testID="group-chat-summary-text"
            >
              {summary}
            </Text>
          ) : null}
        </View>
      )}
    </View>
  );
}