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
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';

import { initializeRTL } from '../src/platform/rtl';
import { colors } from '../src/theme';

void SplashScreen.preventAutoHideAsync();
initializeRTL();

export default function RootLayout() {
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
    <Stack
      screenOptions={{
        contentStyle: { backgroundColor: colors.cream },
        headerShown: false,
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="gallery" />
    </Stack>
  );
}
