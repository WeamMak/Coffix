import Feather from '@expo/vector-icons/Feather';
import { router, type Href } from 'expo-router';
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, View } from 'react-native';

import { EmptyState } from '../../../src/components/EmptyState';
import { ErrorState } from '../../../src/components/ErrorState';
import { IconButton } from '../../../src/components/IconButton';
import { Pill } from '../../../src/components/Pill';
import { Screen } from '../../../src/components/Screen';
import { Text } from '../../../src/components/Text';
import { useSession } from '../../../src/features/auth/useSession';
import { machineModelImage } from '../../../src/features/catalog/types';
import type { Machine } from '../../../src/features/machines/api';
import { useMachines, useRefetchOnFocus } from '../../../src/features/machines/queries';
import {
  activeServiceCount,
  needsSerialCompletion,
  serialDisplay,
  warrantyLabelShort,
  warrantyTone,
} from '../../../src/features/machines/warranty';
import { colors, radii, spacing } from '../../../src/theme';

type MachinesListContentProps = {
  sessionScope: string;
};

function ItemSeparator() {
  return <View style={styles.separator} />;
}

function RegisterFooter({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityLabel="רישום מכונה נוספת"
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.registerFooter, pressed ? styles.pressed : undefined]}
    >
      <Feather color={colors.ink2} name="plus" size={18} />
      <Text color={colors.ink2} variant="label">רישום מכונה נוספת</Text>
    </Pressable>
  );
}

function MachineRow({
  machine,
  onPress,
}: {
  machine: Machine;
  onPress: (machineId: string) => void;
}) {
  const label = `${machine.model.manufacturer} ${machine.model.model_name}`;
  const image = machineModelImage(machine.model.manufacturer, machine.model.model_name, label);
  const openServices = activeServiceCount(machine);

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={() => onPress(machine.id)}
      style={({ pressed }) => [styles.row, pressed ? styles.pressed : undefined]}
    >
      <Image
        accessibilityIgnoresInvertColors
        resizeMode="cover"
        source={{ uri: image.url }}
        style={styles.rowImage}
      />
      <View style={styles.rowBody}>
        <Text color={colors.ink2} variant="eyebrow">{machine.model.manufacturer}</Text>
        <Text variant="sectionTitle">{machine.model.model_name}</Text>
        {needsSerialCompletion(machine) ? null : (
          <Text color={colors.ink3} variant="caption">{serialDisplay(machine)}</Text>
        )}
        <View style={styles.pills}>
          {openServices > 0 ? (
            <Pill textVariant="captionStrong" tone="warn">
              {`${openServices} שירות פעיל`}
            </Pill>
          ) : null}
          {needsSerialCompletion(machine) ? (
            <Pill textVariant="captionStrong" tone="warn">יש להשלים מספר סידורי</Pill>
          ) : null}
          <Pill textVariant="captionStrong" tone={warrantyTone(machine)}>
            {warrantyLabelShort(machine)}
          </Pill>
        </View>
      </View>
      <Feather color={colors.ink3} name="chevron-left" size={18} />
    </Pressable>
  );
}

export function MachinesListContent({ sessionScope }: MachinesListContentProps) {
  const machines = useMachines(sessionScope);
  useRefetchOnFocus(machines.refetch);

  const goToRegister = () => router.push('/(tabs)/(service)/register' as Href);

  const header = (
    <View style={styles.header}>
      <Text variant="screenTitle">שירות</Text>
      <IconButton
        accessibilityLabel="רישום מכונה חדשה"
        icon={<Feather color={colors.ink} name="plus" size={18} />}
        onPress={goToRegister}
      />
    </View>
  );

  if (machines.isPending) {
    return (
      <Screen contentContainerStyle={styles.center} header={header}>
        <ActivityIndicator color={colors.accentDeep} />
        <Text>טוענים מכונות</Text>
      </Screen>
    );
  }

  if (machines.isError) {
    return (
      <Screen contentContainerStyle={styles.center} header={header}>
        <ErrorState
          message="לא הצלחנו לטעון את המכונות"
          onRetry={() => void machines.refetch()}
        />
      </Screen>
    );
  }

  return (
    <Screen contentContainerStyle={styles.body} header={header}>
      <FlatList
        ItemSeparatorComponent={ItemSeparator}
        ListEmptyComponent={(
          <EmptyState
            actionLabel="רישום מכונה"
            description="עדיין לא רשמתם מכונת קפה. רישום מכונה פותח אפשרות לבקשות שירות."
            onAction={goToRegister}
            title="אין מכונות רשומות"
          />
        )}
        ListFooterComponent={machines.data.length > 0 ? (
          <>
            <ItemSeparator />
            <RegisterFooter onPress={goToRegister} />
          </>
        ) : null}
        contentContainerStyle={styles.listContent}
        data={machines.data}
        keyExtractor={(machine) => machine.id}
        onRefresh={() => void machines.refetch()}
        refreshing={machines.isRefetching}
        renderItem={({ item }) => (
          <MachineRow
            machine={item}
            onPress={(machineId) => (
              router.push(`/(tabs)/(service)/machines/${machineId}` as Href)
            )}
          />
        )}
        style={styles.list}
        testID="machines-list"
      />
    </Screen>
  );
}

export default function MachinesListScreen() {
  const { sessionScope } = useSession();
  return <MachinesListContent sessionScope={sessionScope ?? ''} />;
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  body: {
    paddingEnd: 0,
    paddingStart: 0,
  },
  center: {
    alignItems: 'center',
    gap: spacing.lg,
    justifyContent: 'center',
  },
  list: {
    flex: 1,
  },
  listContent: {
    flexGrow: 1,
    paddingBottom: spacing['3xl'],
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
  },
  separator: {
    height: spacing.md,
  },
  row: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.featured,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  rowImage: {
    backgroundColor: colors.chip,
    borderRadius: radii.card,
    height: 104,
    width: 104,
  },
  registerFooter: {
    alignItems: 'center',
    borderColor: colors.line,
    borderRadius: radii.featured,
    borderStyle: 'dashed',
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    paddingVertical: spacing.xl,
  },
  rowBody: {
    flex: 1,
    gap: spacing.xs,
    justifyContent: 'center',
  },
  pills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
});
