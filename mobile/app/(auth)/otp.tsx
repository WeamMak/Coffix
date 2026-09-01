import Feather from '@expo/vector-icons/Feather';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  TextInput,
  View,
  type NativeSyntheticEvent,
  type TextInputKeyPressEventData,
} from 'react-native';

import { displayError, type DisplayError } from '../../src/api/errors';
import { Button } from '../../src/components/Button';
import { IconButton } from '../../src/components/IconButton';
import { Screen } from '../../src/components/Screen';
import { Text } from '../../src/components/Text';
import { authApi } from '../../src/features/auth/api';
import { useSession } from '../../src/features/auth/useSession';
import {
  colors,
  fontFamilies,
  radii,
  spacing,
} from '../../src/theme';

const OTP_LENGTH = 6;

export default function OtpScreen() {
  const params = useLocalSearchParams<{ phone?: string | string[] }>();
  const phone = Array.isArray(params.phone) ? params.phone[0] : params.phone;
  const { signIn } = useSession();
  const [digits, setDigits] = useState(() => Array(OTP_LENGTH).fill('') as string[]);
  const [error, setError] = useState<DisplayError | null>(null);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(60);
  const [timerGeneration, setTimerGeneration] = useState(0);
  const inputRefs = useRef<Array<TextInput | null>>([]);
  const submittingRef = useRef(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setResendSeconds((current) => {
        if (current <= 1) {
          clearInterval(timer);
          return 0;
        }
        return current - 1;
      });
    }, 1_000);

    return () => clearInterval(timer);
  }, [timerGeneration]);

  const submit = async (code: string) => {
    if (!phone || code.length !== OTP_LENGTH || submittingRef.current) {
      return;
    }

    submittingRef.current = true;
    setIsSubmitting(true);
    setError(null);
    try {
      await signIn(phone, code);
      router.replace('/(tabs)/(home)');
    } catch (verifyError) {
      setError(displayError(
        verifyError,
        'לא הצלחנו לאמת את הקוד. נסו שוב.',
      ));
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const changeDigit = (index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    const nextDigits = [...digits];
    nextDigits[index] = digit;
    setDigits(nextDigits);

    if (digit && index < OTP_LENGTH - 1) {
      const nextIndex = index + 1;
      setFocusedIndex(nextIndex);
      inputRefs.current[nextIndex]?.focus();
    }

    const code = nextDigits.join('');
    if (code.length === OTP_LENGTH) {
      void submit(code);
    }
  };

  const handleKeyPress = (
    index: number,
    event: NativeSyntheticEvent<TextInputKeyPressEventData>,
  ) => {
    if (event.nativeEvent.key === 'Backspace' && !digits[index] && index > 0) {
      const previousIndex = index - 1;
      setFocusedIndex(previousIndex);
      inputRefs.current[previousIndex]?.focus();
    }
  };

  const resend = async () => {
    if (!phone || resendSeconds > 0 || isResending) {
      return;
    }

    setIsResending(true);
    setError(null);
    try {
      await authApi.requestOtp(phone);
      setResendSeconds(60);
      setTimerGeneration((current) => current + 1);
    } catch (resendError) {
      setError(displayError(
        resendError,
        'לא הצלחנו לשלוח קוד חדש. נסו שוב.',
      ));
    } finally {
      setIsResending(false);
    }
  };

  const resendMinutes = Math.floor(resendSeconds / 60);
  const resendRemainder = resendSeconds % 60;
  const resendLabel = resendSeconds > 0
    ? `שליחה שוב · בעוד ${String(resendMinutes).padStart(2, '0')}:${String(resendRemainder).padStart(2, '0')}`
    : 'שליחה שוב';

  return (
    <Screen
      contentContainerStyle={styles.screen}
      keyboardDismissMode="on-drag"
      scroll
    >
      <IconButton
        accessibilityLabel="חזרה"
        icon={<Feather color={colors.ink} name="chevron-right" size={18} />}
        onPress={() => router.back()}
        style={styles.back}
      />
      <View style={styles.content}>
        <Text style={styles.title} variant="display">
          שלחנו לך קוד
        </Text>
        <Text color={colors.ink2} style={styles.description}>
          {'הקוד נשלח למספר '}
          <Text color={colors.ink} style={styles.phone} variant="label">
            {phone ?? ''}
          </Text>
        </Text>
        <View style={styles.codeRow}>
          {digits.map((digit, index) => (
            <TextInput
              accessibilityLabel={`ספרה ${index + 1} מתוך 6`}
              autoFocus={index === 0}
              caretHidden
              key={index}
              keyboardType="number-pad"
              maxLength={1}
              onChangeText={(value) => changeDigit(index, value)}
              onFocus={() => setFocusedIndex(index)}
              onKeyPress={(event) => handleKeyPress(index, event)}
              ref={(input) => {
                inputRefs.current[index] = input;
              }}
              selectTextOnFocus
              style={[
                styles.codeInput,
                focusedIndex === index || digit ? styles.codeInputActive : undefined,
              ]}
              value={digit}
            />
          ))}
        </View>
        <Button
          disabled={resendSeconds > 0 || isResending}
          onPress={resend}
          size="small"
          style={styles.resend}
          tone="soft"
        >
          {resendLabel}
        </Button>
        {error ? (
          <View accessibilityLiveRegion="polite" style={styles.error}>
            <Text align="center" color={colors.accentDeep}>{error.message}</Text>
            {error.correlationId ? (
              <Text align="center" color={colors.ink3} variant="caption">
                {`מזהה פנייה: ${error.correlationId}`}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
      <Button
        disabled={digits.some((digit) => !digit) || isSubmitting}
        fullWidth
        onPress={() => submit(digits.join(''))}
      >
        אימות והמשך
      </Button>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingBottom: spacing['2xl'],
    paddingTop: spacing.lg,
  },
  content: {
    flex: 1,
    paddingTop: spacing.xl,
  },
  back: {
    alignSelf: 'flex-start',
    borderRadius: 22,
    height: 44,
    width: 44,
  },
  title: {
    marginBottom: spacing.md,
  },
  description: {
    marginBottom: spacing['2xl'],
  },
  phone: {
    writingDirection: 'ltr',
  },
  codeRow: {
    direction: 'ltr',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
  },
  codeInput: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.input,
    borderWidth: 1,
    color: colors.ink,
    fontFamily: fontFamilies.serif.medium,
    fontSize: 26,
    height: 60,
    padding: 0,
    textAlign: 'center',
    width: 46,
  },
  codeInputActive: {
    borderColor: colors.ink,
    borderWidth: 1.5,
  },
  resend: {
    alignSelf: 'center',
    marginTop: spacing.xl,
  },
  error: {
    gap: spacing.xs,
    marginTop: spacing.xl,
  },
});
