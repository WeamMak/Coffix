import { Card } from './Card';
import { Text } from './Text';
import type { ServiceRequest } from '../features/service/api';
import { addressLabel, PREFERRED_WINDOW_COPY } from '../features/service/status';
import { formatDateTime } from '../features/machines/warranty';
import { spacing } from '../theme';

export function AppointmentCard({ request }: { request: ServiceRequest }) {
  return <Card style={{ gap: spacing.sm }}>
    <Text variant="sectionTitle">{request.location_mode === 'pickup' ? 'איסוף מהבית' : 'הבאה לחנות'}</Text>
    <Text>{addressLabel(request.address_snapshot)}</Text>
    {request.preferred_window_start ? <>
      <Text variant="label">מועד מועדף — בקשה בלבד</Text>
      <Text>{`${formatDateTime(request.preferred_window_start)} – ${formatDateTime(request.preferred_window_end)}`}</Text>
    </> : null}
    {request.confirmed_appointment_start && request.confirmed_appointment_end ? <>
      <Text variant="label">תור מאושר על ידי הצוות</Text>
      <Text>{`${formatDateTime(request.confirmed_appointment_start)} – ${formatDateTime(request.confirmed_appointment_end)}`}</Text>
    </> : <Text>{PREFERRED_WINDOW_COPY}</Text>}
  </Card>;
}
