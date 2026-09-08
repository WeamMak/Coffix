import type { components } from '@coffix/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Text } from '../../components/Text';
import { spacing } from '../../theme';
import { profileApi } from './api';

type Props = {
  profile: components['schemas']['UserRead'];
  sessionScope: string;
  onboarding?: boolean;
  onSaved?(): void;
};

export function PersonalDetails({ profile, sessionScope, onboarding = false, onSaved }: Props) {
  const client = useQueryClient();
  const [name, setName] = useState(profile.display_name ?? '');
  const [email, setEmail] = useState(profile.email ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [errors, setErrors] = useState<{ name?: string; email?: string }>({});

  async function save() {
    if (busy) return;
    const validation = {
      name: name.trim() ? undefined : 'יש להזין שם מלא.',
      email: email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? 'יש להזין כתובת אימייל תקינה.' : undefined,
    };
    setErrors(validation);
    if (validation.name || validation.email) return;
    setBusy(true); setError('');
    try {
      const saved = await profileApi.update({ display_name: name.trim(), email: email.trim() || null });
      client.setQueryData(['private', sessionScope, 'profile'], saved);
      void client.invalidateQueries({ queryKey: ['private', sessionScope, 'activity'] });
      if (!saved.profile_complete) { setError('יש להשלים את הפרטים לפני שממשיכים.'); return; }
      onSaved?.();
      if (!onboarding) setError('הפרטים נשמרו.');
    } catch { setError('לא הצלחנו לשמור את הפרטים. אפשר לנסות שוב.'); }
    finally { setBusy(false); }
  }

  return <View style={{ gap: spacing.lg, direction: 'rtl' }}>
    {onboarding ? <Text>לפני שמתחילים, נשמח להכיר אותך. יש למלא שם מלא כדי להמשיך.</Text> : null}
    <Input label="שם מלא *" value={name} onChangeText={setName} maxLength={120} autoComplete="name" textContentType="name" editable={!busy} error={errors.name} />
    <Input label="אימייל (לא חובה)" value={email} onChangeText={setEmail} maxLength={254} autoComplete="email" textContentType="emailAddress" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} direction="ltr" editable={!busy} error={errors.email} />
    <Input label="מספר טלפון מאומת" value={profile.phone_e164} editable={false} direction="ltr" />
    <Text variant="caption">מספר הטלפון משמש לכניסה ואומת בקוד. כתובות למשלוח מנוהלות בנפרד במסך הכתובות.</Text>
    {error ? <Text accessibilityLiveRegion="polite">{error}</Text> : null}
    <Button disabled={busy} onPress={() => void save()}>{onboarding ? 'שמירה והמשך' : 'שמירת פרטים'}</Button>
  </View>;
}
