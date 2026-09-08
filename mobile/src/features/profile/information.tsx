import type { components } from '@coffix/api-client';
import { useQuery } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import { ActivityIndicator, Linking, View } from 'react-native';
import { apiClient } from '../../api/client';
import { Button } from '../../components/Button';
import { Text } from '../../components/Text';
import { spacing } from '../../theme';
import { useSession } from '../auth/useSession';

type Information = components['schemas']['AppInformation'];
export function ShopInformation({ children }: { children(data: Information): ReactNode }) {
  const { sessionScope } = useSession();
  const information = useQuery({ queryKey: ['private', sessionScope, 'app-info'], queryFn: () => apiClient.request<Information>('/api/v1/app-info') });
  if (information.isPending) return <ActivityIndicator accessibilityLabel="טוענים פרטי חנות" />;
  if (information.isError) return <><Text>לא הצלחנו לטעון את פרטי החנות.</Text><Button onPress={() => void information.refetch()}>ניסיון נוסף</Button></>;
  return children(information.data);
}

export function ExternalAction({ label, url, deviceSettings = false }: { label: string; url?: string; deviceSettings?: boolean }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function open() {
    setError(''); setBusy(true);
    try {
      if (deviceSettings) await Linking.openSettings();
      else if (url) await Linking.openURL(url);
    } catch { setError('לא הצלחנו לפתוח את הקישור. אפשר לנסות שוב.'); }
    finally { setBusy(false); }
  }
  return <View style={{ gap: spacing.sm }}><Button tone="soft" disabled={busy} onPress={() => void open()}>{label}</Button>
    {error ? <Text accessibilityLiveRegion="polite">{error}</Text> : null}
  </View>;
}
