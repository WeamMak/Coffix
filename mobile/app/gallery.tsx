import Feather from '@expo/vector-icons/Feather';
import { Redirect } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { BottomTabs, type TabKey } from '../src/components/BottomTabs';
import { Button } from '../src/components/Button';
import { Card } from '../src/components/Card';
import { IconButton } from '../src/components/IconButton';
import { Input } from '../src/components/Input';
import { Pill } from '../src/components/Pill';
import { Screen } from '../src/components/Screen';
import { Text } from '../src/components/Text';
import { he } from '../src/i18n/he';
import { colors, spacing } from '../src/theme';

export default function GalleryRoute() {
  const [activeTab, setActiveTab] = useState<TabKey>('home');
  const [phone, setPhone] = useState('050-0000000');

  if (!__DEV__) {
    return <Redirect href="/(auth)" />;
  }

  return (
    <Screen contentContainerStyle={styles.screen} scroll>
      <View style={styles.headerRow}>
        <View style={styles.headerCopy}>
          <Text variant="display">{he.gallery.title}</Text>
          <Text color={colors.ink2}>{he.gallery.subtitle}</Text>
        </View>
        <IconButton
          accessibilityLabel="כפתור לדוגמה"
          icon={<Feather color={colors.ink} name="coffee" size={20} />}
          onPress={() => undefined}
        />
      </View>

      <View style={styles.section}>
        <Text variant="sectionTitle">טיפוגרפיה</Text>
        <Text variant="screenTitle">כותרת מסך</Text>
        <Text>{he.gallery.cardBody}</Text>
        <Text color={colors.ink3} variant="caption">
          כיתוב משני נגיש וגמיש
        </Text>
      </View>

      <Card style={styles.section}>
        <View style={styles.cardHeading}>
          <Text variant="sectionTitle">{he.gallery.cardTitle}</Text>
          <Pill tone="accent">{he.gallery.pill}</Pill>
        </View>
        <Text color={colors.ink2}>{he.gallery.cardBody}</Text>
      </Card>

      <Input
        direction="ltr"
        keyboardType="phone-pad"
        label={he.gallery.inputLabel}
        onChangeText={setPhone}
        placeholder={he.gallery.inputPlaceholder}
        value={phone}
      />

      <View style={styles.actions}>
        <Button fullWidth onPress={() => undefined}>
          {he.gallery.primaryAction}
        </Button>
        <Button fullWidth onPress={() => undefined} tone="accent">
          {he.gallery.secondaryAction}
        </Button>
        <Button disabled fullWidth onPress={() => undefined}>
          {he.gallery.disabledAction}
        </Button>
      </View>

      <BottomTabs activeKey={activeTab} onSelect={setActiveTab} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    gap: spacing['2xl'],
    paddingBottom: spacing['3xl'],
    paddingTop: spacing.xl,
  },
  headerRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.lg,
    justifyContent: 'space-between',
  },
  headerCopy: {
    flex: 1,
    gap: spacing.sm,
  },
  section: {
    gap: spacing.md,
  },
  cardHeading: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  actions: {
    gap: spacing.md,
  },
});
