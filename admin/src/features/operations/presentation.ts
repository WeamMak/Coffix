import { label } from '../../components/labels';
import { money, type Schema } from '../service/api';

const knownActions = [
  'catalog.category_created', 'catalog.category_updated', 'catalog.product_created', 'catalog.product_updated',
  'catalog.product_images_updated', 'catalog.sku_created', 'catalog.sku_updated', 'catalog.machine_model_created',
  'catalog.machine_model_updated', 'inventory.stock_corrected', 'user.access_changed', 'notification.delivery_retried',
  'service.note_added', 'service.assignment_changed',
];
export const actionLabels: Record<string, string> = Object.fromEntries(knownActions.map((action) => [action, label(action)]));
actionLabels['shop.settings_updated'] = 'עדכון הגדרות החנות';
export const targetLabels: Record<string, string> = {
  order: 'הזמנה', service_request: 'בקשת שירות', user: 'אדם', product: 'מוצר', category: 'קטגוריה',
  product_sku: 'מק״ט', machine_model: 'דגם מכונה', service_type: 'סוג שירות', shop_settings: 'הגדרות החנות', notification_delivery: 'שליחת התראה',
};
export function auditAction(row: Schema['AuditLogRead']): string {
  if (row.action === 'shop.settings_updated' && row.before && row.after &&
      'shipping_fee_agorot' in row.before && 'shipping_fee_agorot' in row.after &&
      row.before.shipping_fee_agorot !== row.after.shipping_fee_agorot) return 'שינוי דמי משלוח';
  return actionLabels[row.action] ?? 'פעולה נוספת';
}

const errorLabels: Record<string, string> = {
  TEMPORARY: 'תקלה זמנית אצל ספק ההתראות.',
  PUSH_RETRYABLE_FAILURE: 'תקלה זמנית אצל ספק ההתראות.',
  INVALID_TOKEN: 'כתובת ההתראות של המכשיר אינה תקפה עוד.',
  UNREGISTERED: 'המכשיר אינו רשום עוד לקבלת התראות מהספק.',
  DEVICE_SESSION_ENDED: 'חיבור המכשיר לחשבון הסתיים.',
};
export function deliveryError(code: string | null): string {
  return code && errorLabels[code] ? errorLabels[code] : 'סיבת התקלה אינה זמינה. קוד התקלה מופיע בפרטים הטכניים לבדיקת התמיכה.';
}
export const retryReasons: Record<string, string> = {
  device_inactive: 'המכשיר אינו פעיל לקבלת התראות. בקשו מהלקוח לפתוח ולהתחבר לאפליקציה; ניסיון חוזר למכשיר זה אינו זמין.',
  device_owner_changed: 'המכשיר משויך כעת לחשבון אחר. אין לשלוח אליו את הודעת הלקוח; בדקו שהלקוח מחובר לחשבון שלו באפליקציה.',
  delivery_in_progress: 'מתבצע ניסיון שליחה. המתינו לעדכון המצב לפני פעולה נוספת.',
};
export function deliveryState(row: Schema['DeliveryFailureRead']): string {
  if (row.claimed_at) return 'בשליחה';
  return row.state === 'dead_letter' ? 'השליחה הופסקה' : row.state === 'retry' ? 'מתוכננת שליחה חוזרת' : 'ממתינה לשליחה';
}

const fields: Record<string, string> = {
  shipping_fee_agorot: 'דמי משלוח', shipping_agorot: 'דמי משלוח', total_agorot: 'סכום כולל', subtotal_agorot: 'סכום מוצרים',
  price_agorot: 'מחיר', diagnostic_fee_agorot: 'דמי אבחון', role: 'תפקיד', is_active: 'פעיל', state: 'מצב',
  stock_quantity: 'כמות במלאי', reason: 'סיבה', attempt_count: 'ניסיונות שליחה', last_error_code: 'שגיאה אחרונה',
  shop_address: 'כתובת החנות', phone: 'טלפון', phone_e164: 'טלפון', whatsapp: 'וואטסאפ', email: 'דוא״ל', opening_hours: 'שעות פתיחה',
  street: 'רחוב', building: 'בניין', city: 'עיר', country: 'מדינה', postal_code: 'מיקוד',
  name_he: 'שם', description_he: 'תיאור', label_he: 'שם', label_en: 'שם באנגלית', admin_label_en: 'שם באנגלית לניהול',
  display_name: 'שם', manufacturer: 'יצרן', model_name: 'דגם', sku_code: 'מק״ט', attributes: 'מאפיינים',
  product_type: 'סוג מוצר', is_featured: 'מוצר מומלץ', sort_order: 'סדר תצוגה', slug: 'שם כתובת', icon_key: 'סמל',
  default_warranty_months: 'חודשי אחריות', serial_pattern: 'תבנית מספר סידורי', version: 'גרסה',
  assigned_technician_id: 'טכנאי משובץ', technician_id: 'טכנאי', visibility: 'נראות', body: 'תוכן', images: 'תמונות',
  alt_he: 'תיאור תמונה', category_id: 'קטגוריה', machine_model_id: 'דגם מכונה', image_media_id: 'תמונה',
};
const monetaryFields = new Set(['shipping_fee_agorot', 'shipping_agorot', 'total_agorot', 'subtotal_agorot', 'price_agorot', 'diagnostic_fee_agorot']);
export function fieldLabel(key: string): string { return fields[key] ?? `שדה נוסף (${key})`; }
export function displayValue(key: string, value: unknown): string {
  if (value === undefined) return 'לא תועד';
  if (value === null) return 'ללא ערך';
  if (value === '[REDACTED]') return 'מידע רגיש הוסתר';
  if (typeof value === 'boolean') return value ? 'כן' : 'לא';
  if (typeof value === 'number' && monetaryFields.has(key)) return money(value);
  if (typeof value === 'string') {
    if (!value) return 'טקסט ריק';
    if (['role', 'state', 'product_type', 'visibility'].includes(key)) {
      const translated = label(value); return translated === 'לא ידוע' ? `ערך לא מוכר (${value})` : translated;
    }
    if (key === 'country' && value === 'IL') return 'ישראל';
    return value;
  }
  if (Array.isArray(value)) return value.length ? value.map((entry) => displayValue(key, entry)).join(' · ') : 'רשימה ריקה';
  if (typeof value === 'object') return Object.entries(value).map(([field, entry]) => `${fieldLabel(field)}: ${displayValue(field, entry)}`).join('; ') || 'רשומה ריקה';
  return String(value);
}
export function auditChanges(row: Schema['AuditLogRead']) {
  return [...new Set([...Object.keys(row.before ?? {}), ...Object.keys(row.after ?? {})])].map((key) => ({
    key, label: fieldLabel(key), before: displayValue(key, row.before?.[key]), after: displayValue(key, row.after?.[key]),
    unchanged: row.before != null && row.after != null && key in row.before && key in row.after && JSON.stringify(row.before[key]) === JSON.stringify(row.after[key]),
  }));
}
export function recordHref(kind: string, id: string | null, reference: string | null): string | null {
  if (kind === 'shop_settings') return '/configuration/shop';
  if (!id) return null;
  if (kind === 'order') return `/orders/${encodeURIComponent(id)}`;
  if (kind === 'service_request') return `/service/${encodeURIComponent(id)}`;
  if (kind === 'machine_model') return '/configuration';
  if (kind === 'service_type') return '/configuration/service-types';
  if (kind === 'notification_delivery') return '/operations';
  if (kind === 'product') return `/catalog/products/${encodeURIComponent(id)}`;
  if (kind === 'user' && reference) return `/people?q=${encodeURIComponent(reference)}`;
  if (kind === 'product_sku' && reference) return `/catalog/inventory?q=${encodeURIComponent(reference)}`;
  if (kind === 'category' && reference) return `/catalog/categories?q=${encodeURIComponent(reference)}`;
  return null;
}
