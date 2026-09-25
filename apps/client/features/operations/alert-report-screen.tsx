import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { AlertCircle, ArrowLeft } from 'lucide-react-native';
import { colors, mobileType, space } from '@claire/design-system';
import { fetchOperationsAlert, type OperationsAlertReport } from '../../services/operations-alerts';

function ReportField({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <View style={{ paddingVertical: space[3], borderBottomWidth: 1, borderBottomColor: colors.neutral[200], gap: 4 }}>
      <Text style={{ ...mobileType.monoLabel, color: colors.neutral[600], textTransform: 'uppercase' }}>{label}</Text>
      <Text selectable style={{ ...mobileType.body, color: colors.ink }}>{String(value)}</Text>
    </View>
  );
}

export function AlertReportScreen() {
  const { alertId } = useLocalSearchParams<{ alertId: string }>();
  const [report, setReport] = useState<OperationsAlertReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!alertId) return;
    let active = true;
    void fetchOperationsAlert(alertId)
      .then((next) => { if (active) setReport(next); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'Could not load this alert'); });
    return () => { active = false; };
  }, [alertId]);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.cream }} contentContainerStyle={{ padding: space[4], paddingBottom: space[8] }}>
      <Pressable onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/dashboard')} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: space[1], marginBottom: space[5] }}>
        <ArrowLeft size={15} color={colors.ink} />
        <Text style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>Back</Text>
      </Pressable>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
        <AlertCircle size={22} color={colors.danger} />
        <Text accessibilityRole="header" style={{ ...mobileType.display, fontSize: 30, color: colors.ink }}>Operations report</Text>
      </View>
      {report ? (
        <View style={{ marginTop: space[5], padding: space[4], backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.neutral[200], borderRadius: 16 }}>
          <Text style={{ ...mobileType.body, fontWeight: '700', color: colors.ink }}>{report.title}</Text>
          <Text style={{ ...mobileType.bodySmall, color: colors.neutral[600], marginTop: 4 }}>{report.summary}</Text>
          <View style={{ marginTop: space[3] }}>
            <ReportField label="User" value={report.user_email || 'Unknown user'} />
            <ReportField label="User ID" value={report.user_id} />
            <ReportField label="Screen" value={report.screen || 'Unknown'} />
            <ReportField label="API request" value={report.request_method && report.request_path ? `${report.request_method} ${report.request_path}` : null} />
            <ReportField label="HTTP status" value={report.http_status} />
            <ReportField label="Service" value={report.platform} />
            <ReportField label="Connection session" value={report.session_id} />
            <ReportField label="Occurred" value={new Date(report.created_at).toLocaleString()} />
          </View>
        </View>
      ) : error ? (
        <Text style={{ ...mobileType.body, color: colors.danger, marginTop: space[5] }}>{error}</Text>
      ) : (
        <View style={{ marginTop: space[8], alignItems: 'center' }}><ActivityIndicator color={colors.ink} /></View>
      )}
    </ScrollView>
  );
}
