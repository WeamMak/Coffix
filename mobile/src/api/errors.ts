import { ApiClientError } from '@coffix/api-client';

const HEBREW_ERROR_MESSAGES: Record<string, string> = {
  CART_EXPIRED: 'תוקף שמירת הסל הסתיים. טענו עבורכם סל עדכני.',
  INSUFFICIENT_STOCK: 'אין מספיק מלאי לכמות שבחרתם. הסל עודכן.',
  invalid_phone: 'מספר הטלפון אינו תקין.',
  otp_invalid: 'הקוד שהוזן אינו נכון. נסו שוב.',
  otp_rate_limited: 'בוצעו יותר מדי ניסיונות. נסו שוב מאוחר יותר.',
  otp_resend_cooldown: 'אפשר לבקש קוד חדש בעוד כמה רגעים.',
};

export type DisplayError = {
  correlationId: string | null;
  message: string;
};

export function displayError(error: unknown, fallback: string): DisplayError {
  if (!(error instanceof ApiClientError)) {
    return { correlationId: null, message: fallback };
  }

  return {
    correlationId: error.problem.correlationId === 'unknown'
      ? null
      : error.problem.correlationId,
    message: HEBREW_ERROR_MESSAGES[error.problem.code] ?? fallback,
  };
}
