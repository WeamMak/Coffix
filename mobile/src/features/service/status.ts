import type { ServiceRequest } from './api';

export const serviceStatusLabels: Record<ServiceRequest['state'], string> = {
  awaiting_diagnostic_payment: 'ממתין לתשלום אבחון',
  awaiting_admin_review: 'ממתין לבדיקת הצוות',
  scheduled: 'תור מאושר', received: 'המכונה התקבלה', diagnosing: 'באבחון',
  awaiting_additional_decision: 'ממתין להחלטתכם',
  awaiting_additional_payment: 'ממתין לתשלום נוסף',
  repair_in_progress: 'בתיקון', ready_for_return: 'מוכן להחזרה', completed: 'הושלם', cancelled: 'בוטל',
};
export const NON_REFUNDABLE_COPY = 'תשלומי שירות אינם ניתנים להחזר. דמי האבחון נשארים בתוקף גם אם תבחרו שלא להמשיך בתיקון.';
export const PREFERRED_WINDOW_COPY = 'המועד המועדף הוא בקשה בלבד. הצוות יאשר תור לאחר תשלום דמי האבחון.';
export function serviceTimeline(request: ServiceRequest) {
  return request.history.map((entry, index) => ({ ...entry, index }))
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.index - b.index)
    .map(entry => ({ key: `${entry.created_at}-${entry.index}`, label: serviceStatusLabels[entry.to_state], timestamp: entry.created_at }));
}
export function addressLabel(address: Record<string, unknown>): string {
  return ['recipient_name', 'street', 'building', 'apartment', 'city', 'postal_code', 'phone']
    .map(key => address[key]).filter(value => typeof value === 'string' && value).join(', ');
}
