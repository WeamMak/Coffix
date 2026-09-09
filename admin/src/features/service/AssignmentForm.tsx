import type { Schema } from './api';
import { AppointmentForm } from './AppointmentForm';

export function AssignmentForm({ service }: { service: Schema['StaffServiceRequestRead'] }) {
  return <AppointmentForm key={service.assigned_technician_id} service={service} assignment />;
}
