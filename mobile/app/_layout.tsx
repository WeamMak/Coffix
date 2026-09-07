import { Assistant_300Light } from '@expo-google-fonts/assistant/300Light';
import { Assistant_400Regular } from '@expo-google-fonts/assistant/400Regular';
import { Assistant_500Medium } from '@expo-google-fonts/assistant/500Medium';
import { Assistant_600SemiBold } from '@expo-google-fonts/assistant/600SemiBold';
import { Assistant_700Bold } from '@expo-google-fonts/assistant/700Bold';
import { Fraunces_400Regular } from '@expo-google-fonts/fraunces/400Regular';
import { Fraunces_500Medium } from '@expo-google-fonts/fraunces/500Medium';
import { Fraunces_600SemiBold } from '@expo-google-fonts/fraunces/600SemiBold';
import { Fraunces_700Bold } from '@expo-google-fonts/fraunces/700Bold';
import { NotoSerifHebrew_400Regular } from '@expo-google-fonts/noto-serif-hebrew/400Regular';
import { NotoSerifHebrew_500Medium } from '@expo-google-fonts/noto-serif-hebrew/500Medium';
import { NotoSerifHebrew_600SemiBold } from '@expo-google-fonts/noto-serif-hebrew/600SemiBold';
import { NotoSerifHebrew_700Bold } from '@expo-google-fonts/noto-serif-hebrew/700Bold';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router/js-stack';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { QueryClientProvider } from '@tanstack/react-query';

import { PushProvider } from '../src/features/notifications/PushProvider';
import { queryClient } from '../src/api/queryClient';
import { AuthSessionProvider } from '../src/features/auth/useSession';
import { PaymentRuntimeProvider } from '../src/features/payments/usePayment';
import { initializeRTL } from '../src/platform/rtl';
import { useStackTransitions } from '../src/navigation/stackTransitions';
import { colors } from '../src/theme';

void SplashScreen.preventAutoHideAsync();
initializeRTL();

export default function RootLayout() {
  const stackTransitions = useStackTransitions();
  const [fontsLoaded, fontError] = useFonts({
    Assistant_300Light,
    Assistant_400Regular,
    Assistant_500Medium,
    Assistant_600SemiBold,
    Assistant_700Bold,
    Fraunces_400Regular,
    Fraunces_500Medium,
    Fraunces_600SemiBold,
    Fraunces_700Bold,
    NotoSerifHebrew_400Regular,
    NotoSerifHebrew_500Medium,
    NotoSerifHebrew_600SemiBold,
    NotoSerifHebrew_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      void SplashScreen.hideAsync();
    }
  }, [fontError, fontsLoaded]);

  if (fontError) {
    throw fontError;
  }

  if (!fontsLoaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.cream }}>
      <QueryClientProvider client={queryClient}>
        <PaymentRuntimeProvider>
          <AuthSessionProvider>
            <PushProvider>
              <Stack
                screenOptions={{
                  ...stackTransitions,
                  cardStyle: { backgroundColor: colors.cream },
                  headerShown: false,
                }}
              >
                <Stack.Screen name="index" />
                <Stack.Screen name="(auth)" />
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="gallery" />
                <Stack.Screen name="notifications" />
              </Stack>
            </PushProvider>
          </AuthSessionProvider>
        </PaymentRuntimeProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
