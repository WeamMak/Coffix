import { Platform } from 'react-native';
import { resolveApiBaseUrl } from './baseUrl';

/** Local signed media is served by the same API the app already connects to. */
export function resolveMediaUrl(url: string): string {
  const local = /^http:\/\/(?:localhost|127\.0\.0\.1|10\.0\.2\.2)(?::\d+)?(\/api\/v1\/media\/local\/content\?[^#]*)$/.exec(url);
  if (!local) return url;
  const base = resolveApiBaseUrl({
    configuredUrl: process.env.EXPO_PUBLIC_API_URL,
    platform: Platform.OS,
  });
  // Preserve the signed query verbatim; external storage URLs are never rewritten.
  return `${new URL(base).origin}${local[1]}`;
}
