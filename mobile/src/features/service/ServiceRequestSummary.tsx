import Feather from '@expo/vector-icons/Feather';
import { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { Card } from '../../components/Card';
import { IconButton } from '../../components/IconButton';
import { Text } from '../../components/Text';
import { colors, spacing } from '../../theme';
import { useMachine } from '../machines/queries';
import { formatDateTime } from '../machines/warranty';
import type { ServiceRequest } from './api';

export function ServiceRequestSummary({ request, sessionScope }: { request: ServiceRequest; sessionScope: string }) {
  const machine = useMachine(sessionScope, request.machine_id);
  const [callError, setCallError] = useState('');
  const confirmed = Boolean(request.confirmed_appointment_start && request.confirmed_appointment_end);
  const rows = [
    ['מכונה', machine.data?.model ? `${machine.data.model.manufacturer} ${machine.data.model.model_name}` : machine.isError ? 'פרטי המכונה אינם זמינים' : 'טוענים מכונה'],
    ['סוג שירות', request.service_type_label_he],
    ['דחיפות', `${request.urgency_name_he}${request.urgency_surcharge_percent ? ` · +${request.urgency_surcharge_percent}%` : ''}`],
    ['מיקום', `${request.location_mode === 'pickup' ? 'איסוף' : 'הבאה לחנות'} · ${[request.address_snapshot.street, request.address_snapshot.building, request.address_snapshot.city].filter(Boolean).join(' ')}`],
    ...(confirmed ? [['תור מאושר על ידי הצוות', `${formatDateTime(request.confirmed_appointment_start)} – ${formatDateTime(request.confirmed_appointment_end)}`]] : []),
    ...(request.preferred_window_start ? [['מועד מועדף — בקשה בלבד', `${formatDateTime(request.preferred_window_start)} – ${formatDateTime(request.preferred_window_end)}`]] : !confirmed ? [['מועד', 'טרם תואם מועד']] : []),
  ];
  const technician = request.assigned_technician;
  return <>
    <Card style={styles.summary}>
      {rows.map(([label, value], index) => <View key={label} style={[styles.row, styles.summaryRow, index < rows.length - 1 && styles.divider]}>
        <Text align="start" variant="caption" color={colors.ink3} style={{ maxWidth: '38%' }}>{label}</Text>
        <Text align="end" style={{ flex: 1 }}>{value}</Text>
      </View>)}
    </Card>
    {technician ? <View style={{ gap: spacing.sm }}>
      <Text align="start" variant="caption" color={colors.ink2}>טכנאי משובץ</Text>
      <Card style={[styles.row, { padding: spacing.lg }]}>
        <View style={styles.avatar}><Text color={colors.cream} variant="sectionTitle">{technician.display_name?.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('·') || <Feather name="tool" size={22} color={colors.cream} />}</Text></View>
        <View style={{ flex: 1 }}><Text align="start" variant="sectionTitle">{technician.display_name || 'טכנאי השירות'}</Text><Text align="start" variant="caption" color={colors.ink3}>טכנאי שירות</Text></View>
        {/^[+]972\d{8,9}$/.test(technician.phone_e164) ? <IconButton accessibilityLabel="התקשרות לטכנאי" icon={<Feather name="phone" size={18} color={colors.ink2} />} style={{ backgroundColor: 'transparent', borderWidth: 0 }} onPress={() => { void Linking.openURL(`tel:${technician.phone_e164}`).catch(() => setCallError('לא הצלחנו לפתוח את החייגן.')); }} /> : null}
      </Card>
      {callError ? <Text align="start" accessibilityLiveRegion="polite">{callError}</Text> : null}
    </View> : null}
  </>;
}
const styles = StyleSheet.create({
  summary: { paddingHorizontal: spacing.lg, paddingVertical: spacing.xs },
  row: { flexDirection: 'row', direction: 'rtl', alignItems: 'center', gap: spacing.md },
  summaryRow: { minHeight: 50, paddingVertical: spacing.md },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.line },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.ink, justifyContent: 'center', alignItems: 'center' },
});
