import Feather from '@expo/vector-icons/Feather';
import { router, type Href } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';

import { EmptyState } from '../../../src/components/EmptyState';
import { ErrorState } from '../../../src/components/ErrorState';
import { IconButton } from '../../../src/components/IconButton';
import { Pill } from '../../../src/components/Pill';
import { Screen } from '../../../src/components/Screen';
import { Text } from '../../../src/components/Text';
import { useSession } from '../../../src/features/auth/useSession';
import type { Machine } from '../../../src/features/machines/api';
import { useMachines, useRefetchOnFocus } from '../../../src/features/machines/queries';
import {
  needsSerialCompletion,
  serialDisplay,
  sourceLabel,
  warrantyLabel,
  warrantyTone,
} from '../../../src/features/machines/warranty';
import { colors, radii, spacing } from '../../../src/theme';

type MachinesListContentProps = {
  sessionScope: string;
};

function ItemSeparator() {
  return <View style={styles.separator} />;
}

function MachineRow({
  machine,
  onPress,
}: {
  machine: Machine;
  onPress: (machineId: string) => void;
}) {
  return (
    <Pressable
      accessibilityLabel={`${machine.model.manufacturer} ${machine.model.model_name}`}
      accessibilityRole="button"
      onPress={() => onPress(machine.id)}
      style={({ pressed }) => [styles.row, pressed ? styles.pressed : undefined]}
    >
      <View style={styles.rowIcon}>
        <Feather color={colors.accentDeep} name="coffee" size={22} />
      </View>
      <View style={styles.rowBody}>
        <Text color={colors.ink3} variant="eyebrow">{machine.model.manufacturer}</Text>
        <Text variant="sectionTitle">{machine.model.model_name}</Text>
        {needsSerialCompletion(machine) ? null : (
          <Text color={colors.ink3} variant="caption">{serialDisplay(machine)}</Text>
        )}
        <View style={styles.pills}>
          <Pill tone={warrantyTone(machine)}>{warrantyLabel(machine)}</Pill>
          {needsSerialCompletion(machine) ? (
            <Pill tone="warn">יש להשלים מספר סידורי</Pill>
          ) : null}
          <Pill>{sourceLabel(machine)}</Pill>
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
  rowIcon: {
    alignItems: 'center',
    backgroundColor: colors.accentSoft,
    borderRadius: radii.card,
    height: 56,
    justifyContent: 'center',
    width: 56,
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
