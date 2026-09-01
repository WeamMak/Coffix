import { createAuthApi } from '@coffix/api-client';

import { apiClient } from '../../api/client';

const NON_DIGITS = /\D/g;

export const authApi = createAuthApi(apiClient);

export function formatPhoneForRtl(phone: string): string {
  return `\u200E${phone}\u200E`;
}

export function normalizeIsraeliPhone(value: string): string | null {
  const digits = value.replace(NON_DIGITS, '');

  if (/^05\d{8}$/.test(digits)) {
    return `+972${digits.slice(1)}`;
  }

  if (/^9725\d{8}$/.test(digits)) {
    return `+${digits}`;
  }

  return null;
}
