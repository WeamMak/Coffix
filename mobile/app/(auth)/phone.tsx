import Feather from '@expo/vector-icons/Feather';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '../../src/components/Button';
import { IconButton } from '../../src/components/IconButton';
import { Input } from '../../src/components/Input';
import { Screen } from '../../src/components/Screen';
import { Text } from '../../src/components/Text';
import { displayError, type DisplayError } from '../../src/api/errors';
import {
  authApi,
  formatPhoneForRtl,
  normalizeIsraeliPhone,
} from '../../src/features/auth/api';
import { colors, spacing } from '../../src/theme';

export default function PhoneScreen() {
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<DisplayError | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const normalizedPhone = normalizeIsraeliPhone(phone);

  const submit = async () => {
    if (!normalizedPhone || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await authApi.requestOtp(normalizedPhone);
      router.push({
        params: { phone: normalizedPhone },
        pathname: '/(auth)/otp',
      });
    } catch (requestError) {
      setError(displayError(
        requestError,
        'לא הצלחנו לשלוח את הקוד. נסו שוב.',
      ));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Screen
      contentContainerStyle={styles.screen}
      keyboardDismissMode="on-drag"
      scroll
    >
      <View testID="phone-form">
        <IconButton
          accessibilityLabel="חזרה"
          icon={<Feather color={colors.ink} name="chevron-right" size={18} />}
          onPress={() => router.back()}
          style={styles.back}
        />
        <Text style={styles.title} variant="display">
          מה המספר שלך?
        </Text>
        <Text color={colors.ink2} style={styles.description}>
          נשלח קוד אימות בן 6 ספרות. בלי סיסמאות, בלי כאב ראש.
        </Text>
        <View style={styles.phoneRow} testID="phone-row">
          <View style={styles.countryCode}>
            <Text style={styles.ltrText} variant="label">🇮🇱 +972</Text>
          </View>
          <Input
            accessibilityLabel="מספר טלפון"
            containerStyle={styles.input}
            direction="ltr"
            keyboardType="phone-pad"
            label="מספר טלפון"
            onChangeText={setPhone}
            placeholder="050-1234567"
            value={phone}
          />
        </View>
        {normalizedPhone ? (
          <View style={styles.normalizedMessage}>
            <Text color={colors.ink3} variant="caption">הקוד יישלח ל־</Text>
            <Text
              accessibilityLabel={normalizedPhone}
              color={colors.ink3}
              style={styles.ltrText}
              variant="caption"
            >
              {formatPhoneForRtl(normalizedPhone)}
            </Text>
          </View>
        ) : null}
        {error ? (
          <View accessibilityLiveRegion="polite" style={styles.error}>
            <Text color={colors.accentDeep}>{error.message}</Text>
          </View>
        ) : null}
        <Button
          disabled={!normalizedPhone || isSubmitting}
          fullWidth
          onPress={submit}
          style={styles.submit}
        >
          שליחת קוד
        </Button>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingBottom: spacing['2xl'],
    paddingTop: spacing['4xl'],
  },
  title: {
    marginBottom: spacing.md,
  },
  back: {
    alignSelf: 'flex-start',
    borderRadius: 22,
    height: 44,
    marginBottom: spacing.xl,
    width: 44,
  },
  description: {
    marginBottom: spacing['2xl'],
  },
  phoneRow: {
    alignItems: 'flex-end',
    direction: 'ltr',
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  countryCode: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: 14,
    borderWidth: 1,
    height: 52,
    justifyContent: 'center',
    width: 92,
  },
  input: {
    flex: 1,
  },
  ltrText: {
    textAlign: 'left',
    writingDirection: 'ltr',
  },
  normalizedMessage: {
    alignItems: 'baseline',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  error: {
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  submit: {
    marginTop: spacing['2xl'],
  },
});
