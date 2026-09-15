import { ApiClientError, type ApiProblem } from '@coffix/api-client';

export function problemFrom(response: Response, payload: unknown): ApiClientError {
  const value = typeof payload === 'object' && payload !== null ? payload as Partial<ApiProblem> : {};
  return new ApiClientError({
    type: typeof value.type === 'string' ? value.type : 'about:blank',
    status: response.status,
    title: typeof value.title === 'string' ? value.title : 'Request failed',
    code: typeof value.code === 'string' ? value.code : 'unexpected_error',
    detail: typeof value.detail === 'string' ? value.detail : undefined,
    correlationId: typeof value.correlationId === 'string'
      ? value.correlationId : response.headers.get('X-Correlation-ID') ?? 'unknown',
  });
}

const changed = 'הרשומה השתנתה מאז פתיחת הטופס. השינויים שלכם נשמרו בטופס; טענו מחדש במפורש לפני ניסיון נוסף.';
const missing = 'הרשומה לא נמצאה או שאינה זמינה לכם עוד.';
const signIn = 'החיבור פג. יש להתחבר מחדש.';
const messages: Record<string, string> = {
  conflict: changed, record_changed: changed, stock_changed: changed,
  service_intake_version_conflict: changed, service_type_version_conflict: changed,
  assignment_changed: 'השיבוץ השתנה. טענו מחדש את הבקשה ובדקו את הטכנאי המשובץ.',
  staff_required: 'הכניסה מיועדת למנהלים ולטכנאים בלבד.',
  session_changed: 'החיבור השתנה. נסו שוב במרחב העבודה הנוכחי.',
  unauthorized: signIn, session_revoked: signIn, refresh_token_expired: signIn,
  refresh_token_invalid: signIn, refresh_token_reused: signIn,
  forbidden: 'אין לכם הרשאה לבצע את הפעולה.',
  account_inactive: 'החשבון מושבת. פנו למנהל החנות.',
  invalid_phone: 'יש להזין מספר טלפון ישראלי תקין.',
  otp_invalid: 'קוד האימות שגוי או שפג תוקפו. בדקו את הקוד או בקשו קוד חדש.',
  otp_rate_limited: 'בוצעו יותר מדי ניסיונות. המתינו לפני ניסיון נוסף.',
  otp_resend_cooldown: 'יש להמתין לפני שליחת קוד נוסף.',
  validation_error: 'בדקו את השדות ואת הערכים שהזנתם ונסו שוב.',
  last_admin: 'לא ניתן להסיר את המנהל הפעיל האחרון.',
  unsafe_self_change: 'לא ניתן להסיר את הרשאות הניהול של עצמכם.',
  web_origin_denied: 'כתובת הכניסה למערכת אינה מורשית. פנו למנהל המערכת.',
  catalog_category_slug_exists: 'מזהה הקטגוריה כבר נמצא בשימוש.',
  catalog_sku_code_exists: 'המק״ט כבר נמצא בשימוש.',
  machine_model_exists: 'דגם המכונה כבר קיים.',
  stock_below_reserved: 'המלאי הכולל אינו יכול להיות נמוך מהכמות השמורה בעגלות.',
  order_confirmation_mismatch: 'יש להזין את מספר ההזמנה המדויק לאישור הפעולה.',
  invalid_order_transition: 'לא ניתן לבצע את הפעולה במצב ההזמנה הנוכחי. רעננו את ההזמנה.',
  idempotency_key_reused: 'פרטי הבקשה שונים מהניסיון הקודם. רעננו ובדקו את התוצאה לפני פעולה נוספת.',
  shipment_already_exists: 'פרטי משלוח כבר נשמרו להזמנה. רעננו את ההזמנה.',
  schedule_overlap: 'קיימת חפיפה בתיאום. בדקו את החפיפה ואשרו במפורש אם ברצונכם להמשיך.',
  appointment_required: 'יש לאשר מועד לפני ביצוע הפעולה.',
  technician_not_available: 'הטכנאי אינו זמין לשיבוץ. רעננו ובחרו טכנאי פעיל.',
  service_transition_not_allowed: 'הפעולה אינה זמינה במצב הבקשה הנוכחי. רעננו ובדקו את התשלומים וההרשאות.',
  service_diagnostic_fee_not_allowed: 'לא ניתן לעדכן את דמי האבחון במצב הנוכחי.',
  service_payment_not_allowed: 'התשלום אינו זמין במצב הבקשה הנוכחי.',
  service_quote_not_allowed: 'לא ניתן ליצור הצעת תיקון במצב הנוכחי.',
  service_quote_decision_not_allowed: 'לא ניתן לשנות את החלטת הצעת התיקון במצב הנוכחי.',
  service_type_not_available: 'סוג השירות אינו זמין לדגם המכונה.',
  service_urgency_not_available: 'אפשרות הדחיפות אינה זמינה עוד.',
  service_window_not_available: 'חלון התיאום אינו זמין עוד.',
  delivery_not_retryable: 'לא ניתן לבצע ניסיון שליחה נוסף כעת. רעננו את הרשימה.',
  media_image_invalid: 'בחרו תמונה שהעליתם עבור סוג הרשומה המתאים.',
  media_signature_mismatch: 'תוכן הקובץ אינו תמונה מהסוג שנבחר.',
  media_type_not_allowed: 'סוג הקובץ אינו נתמך.',
  media_type_mismatch: 'תוכן הקובץ אינו תואם לסוג שנבחר.',
  media_too_large: 'הקובץ גדול מדי. בחרו קובץ קטן יותר.',
  media_size_invalid: 'יש לבחור קובץ שאינו ריק.',
  media_size_mismatch: 'גודל הקובץ שהועלה אינו תואם. נסו להעלות אותו מחדש.',
  media_file_limit_reached: 'הגעתם למספר הקבצים המרבי.',
  media_upload_expired: 'תוקף ההעלאה פג. בחרו את הקובץ ונסו שוב.',
  media_upload_incomplete: 'העלאת הקובץ לא הושלמה. נסו שוב.',
  media_upload_mismatch: 'הקובץ אינו תואם לבקשת ההעלאה.',
  media_not_discardable: 'הקובץ נמצא בשימוש ולא ניתן להסיר אותו.',
  media_collection_required: 'יש לבחור את בקשת השירות שאליה שייך הקובץ.',
  service_media_not_available: 'הקובץ אינו זמין לבקשת השירות הזו.',
  sku_inactive: 'המק״ט אינו פעיל.',
  invalid_currency: 'המחירים חייבים להיות בשקלים חדשים.',
};

export function errorMessage(error: unknown): string {
  if (!(error instanceof ApiClientError)) return 'לא ניתן להתחבר. בדקו את החיבור ונסו שוב.';
  const code = error.problem.code.toLowerCase();
  return messages[code] ?? (code === 'not_found' || code.endsWith('_not_found')
    ? missing : 'לא ניתן להשלים את הפעולה. נסו שוב.');
}
