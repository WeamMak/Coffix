export function resolveApiBaseUrl({ configuredUrl, platform }: {
  configuredUrl?: string;
  platform: string;
}): string {
  const fallback = platform === 'android'
    ? 'http://10.0.2.2:8000'
    : 'http://localhost:8000';
  return (configuredUrl || fallback).replace(/\/+$/, '');
}
