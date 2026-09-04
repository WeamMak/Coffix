import { ApiClientError } from '@coffix/api-client';
import Feather from '@expo/vector-icons/Feather';
import { StatusBar } from 'expo-status-bar';
import { type Href, useLocalSearchParams } from 'expo-router';
import { type ReactElement, useState } from 'react';
import { ActivityIndicator, FlatList, Image, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '../../../../src/components/Button';
import { EmptyState } from '../../../../src/components/EmptyState';
import { ErrorState } from '../../../../src/components/ErrorState';
import { IconButton } from '../../../../src/components/IconButton';
import { Input } from '../../../../src/components/Input';
import { Pill } from '../../../../src/components/Pill';
import { Screen } from '../../../../src/components/Screen';
import { Text } from '../../../../src/components/Text';
import { useSession } from '../../../../src/features/auth/useSession';
import { productTypeImage } from '../../../../src/features/catalog/types';
import type { Machine } from '../../../../src/features/machines/api';
import {
  useCompleteMachineSerial,
  useMachine,
  useRefetchOnFocus,
} from '../../../../src/features/machines/queries';
import {
  formatDateTime,
  formatIsoDate,
  needsSerialCompletion,
  serialDisplay,
  serviceHistoryStatusLabel,
  serviceHistoryStatusTone,
  sourceLabel,
  warrantyLabel,
  warrantyState,
} from '../../../../src/features/machines/warranty';
import { goBack } from '../../../../src/navigation/goBack';
import { colors, radii, spacing } from '../../../../src/theme';

type MachineDetailContentProps = {
  machineId: string;
  sessionScope: string;
};

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

function WarrantyCard({ machine }: { machine: Machine }) {
  const active = warrantyState(machine) === 'active';
  return (
    <View style={[styles.warrantyCard, active ? styles.warrantyCardActive : undefined]}>
      <View style={styles.warrantyHeader}>
        <Feather color={active ? colors.accent : colors.ink3} name="shield" size={18} />
        <Text color={active ? colors.accent : colors.ink3} variant="eyebrow">אחריות</Text>
      </View>
      <Text color={active ? colors.cream : colors.ink} variant="sectionTitle">
        {warrantyLabel(machine)}
      </Text>
    </View>
  );
}

function SerialCompletionForm({
  machine,
  sessionScope,
}: {
  machine: Machine;
  sessionScope: string;
}) {
  const [serialNumber, setSerialNumber] = useState('');
  const completeSerial = useCompleteMachineSerial(sessionScope);
  const trimmed = serialNumber.trim();
  const errorCode = completeSerial.error instanceof ApiClientError
    ? completeSerial.error.problem.code
    : null;

  return (
    <View style={styles.card} testID="serial-completion">
      <Text variant="label">השלמת מספר סידורי</Text>
      <Text color={colors.ink2}>
        המכונה נרשמה אוטומטית מרכישה באפליקציה. יש להזין את המספר הסידורי המופיע על גבי המכונה כדי להשלים את הרישום.
      </Text>
      <Input
        accessibilityLabel="מספר סידורי"
        autoCapitalize="characters"
        label="מספר סידורי"
        onChangeText={setSerialNumber}
        value={serialNumber}
      />
      {errorCode === 'MACHINE_SERIAL_ALREADY_REGISTERED' ? (
        <Text accessibilityLiveRegion="polite" color={colors.accentDeep}>
          מספר סידורי זה כבר רשום למכונה אחרת.
        </Text>
      ) : completeSerial.isError ? (
        <Text accessibilityLiveRegion="polite" color={colors.accentDeep}>
          לא הצלחנו לשמור את המספר הסידורי. נסו שוב.
        </Text>
      ) : null}
      <Button
        accessibilityLabel="שמירת מספר סידורי"
        disabled={!trimmed || completeSerial.isPending}
        onPress={() => (
          completeSerial.mutate({ machineId: machine.id, serialNumber: trimmed })
        )}
      >
        {completeSerial.isPending ? 'שומרים' : 'שמירת מספר סידורי'}
      </Button>
    </View>
  );
}

export function MachineDetailContent({ machineId, sessionScope }: MachineDetailContentProps) {
  const insets = useSafeAreaInsets();
  const query = useMachine(sessionScope, machineId);
  const machine = query.data;
  useRefetchOnFocus(query.refetch);

  const backButton = (
    <IconButton
      accessibilityLabel="חזרה למכונות שלי"
      icon={<Feather color={colors.ink} name="chevron-right" size={20} />}
      onPress={() => goBack('/(tabs)/(service)' as Href)}
      style={[styles.backButton, { top: insets.top + spacing.lg }]}
    />
  );

  if (query.isPending) {
    return (
      <Screen contentContainerStyle={styles.center}>
        {backButton}
        <ActivityIndicator color={colors.accentDeep} />
        <Text>טוענים מכונה</Text>
      </Screen>
    );
  }

  if (query.isError || !machine) {
    const notFound = query.error instanceof ApiClientError
      && query.error.problem.status === 404;
    return (
      <Screen contentContainerStyle={styles.center}>
        {backButton}
        {notFound ? (
          <EmptyState
            actionLabel="חזרה למכונות שלי"
            description="ייתכן שהמכונה נמחקה או שאינה שייכת לחשבון זה."
            onAction={() => goBack('/(tabs)/(service)' as Href)}
            title="לא מצאנו את המכונה"
          />
        ) : (
          <ErrorState
            message="לא הצלחנו לטעון את המכונה"
            onRetry={() => void query.refetch()}
          />
        )}
      </Screen>
    );
  }

  const image = productTypeImage('machine', `${machine.model.manufacturer} ${machine.model.model_name}`);

  const sections: { key: string; render: () => ReactElement }[] = [
    {
      key: 'hero',
      render: () => (
        <View style={styles.hero} testID="machine-summary">
          {image ? (
            <Image
              accessibilityIgnoresInvertColors
              resizeMode="cover"
              source={{ uri: image.url }}
              style={styles.heroImage}
            />
          ) : (
            <View style={styles.heroFallback}>
              <Feather color={colors.accentDeep} name="coffee" size={58} />
            </View>
          )}
        </View>
      ),
    },
    {
      key: 'title',
      render: () => (
        <View style={styles.sheet}>
          <View style={styles.titleRow}>
            <View style={styles.titleCopy}>
              <Text color={colors.accent} variant="eyebrow">{machine.model.manufacturer}</Text>
              <Text variant="display">{machine.model.model_name}</Text>
            </View>
          </View>
          <View style={styles.pills}>
            {needsSerialCompletion(machine) ? (
              <Pill tone="warn">יש להשלים מספר סידורי</Pill>
            ) : null}
            <Pill>{sourceLabel(machine)}</Pill>
          </View>
        </View>
      ),
    },
    { key: 'warranty', render: () => <WarrantyCard machine={machine} /> },
    {
      key: 'details',
      render: () => (
        <View style={styles.card} testID="machine-details">
          {[
            ['מספר סידורי', serialDisplay(machine)],
            [
              'תאריך רכישה',
              machine.purchase_date ? formatIsoDate(machine.purchase_date) : 'לא צוין',
            ],
            ['סטטוס', warrantyLabel(machine)],
          ].map(([label, value], index, all) => (
            <View
              key={label}
              style={[styles.detailRow, index < all.length - 1 ? styles.detailDivider : undefined]}
            >
              <Text color={colors.ink3}>{label}</Text>
              <Text variant="label">{value}</Text>
            </View>
          ))}
        </View>
      ),
    },
    ...(needsSerialCompletion(machine)
      ? [{
        key: 'serial',
        render: () => <SerialCompletionForm machine={machine} sessionScope={sessionScope} />,
      }]
      : []),
    {
      key: 'history',
      render: () => (
        <View style={styles.section} testID="machine-service-history">
          <Text color={colors.ink2} variant="label">היסטוריית שירות</Text>
          {machine.service_history.length === 0 ? (
            <Text color={colors.ink3}>אין עדיין בקשות שירות למכונה זו.</Text>
          ) : (
            machine.service_history.map((entry) => (
              <View key={entry.service_request_id} style={styles.historyRow}>
                <View style={styles.historyIcon}>
                  <Feather color={colors.ink} name="tool" size={16} />
                </View>
                <View style={styles.historyBody}>
                  <Text variant="sectionTitle">{entry.service_type_label_he}</Text>
                  <Text color={colors.ink3} variant="caption">
                    {`${entry.reference} · עודכן ${formatDateTime(entry.updated_at)}`}
                  </Text>
                </View>
                <Pill tone={serviceHistoryStatusTone(entry.state)}>
                  {serviceHistoryStatusLabel(entry.state)}
                </Pill>
              </View>
            ))
          )}
        </View>
      ),
    },
  ];

  return (
    <Screen contentContainerStyle={styles.body} safeAreaEdges={['bottom']}>
      <StatusBar style="light" />
      <FlatList
        contentContainerStyle={styles.listContent}
        data={sections}
        keyExtractor={(section) => section.key}
        onRefresh={() => void query.refetch()}
        refreshing={query.isRefetching}
        renderItem={({ item }) => item.render()}
        style={styles.list}
        testID="machine-detail-list"
      />
      {backButton}
    </Screen>
  );
}

export default function MachineDetailScreen() {
  const params = useLocalSearchParams<{ machineId?: string | string[] }>();
  const { sessionScope } = useSession();
  return (
    <MachineDetailContent
      machineId={firstParam(params.machineId)}
      sessionScope={sessionScope ?? ''}
    />
  );
}

const styles = StyleSheet.create({
  backButton: {
    borderRadius: radii.pill,
    height: 44,
    position: 'absolute',
    start: spacing.lg,
    width: 44,
    zIndex: 2,
  },
  body: {
    paddingEnd: 0,
    paddingStart: 0,
  },
  center: {
    alignItems: 'center',
    gap: spacing.lg,
    justifyContent: 'center',
    paddingHorizontal: spacing['2xl'],
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: spacing['3xl'],
  },
  hero: {
    backgroundColor: colors.ink,
    height: 300,
    position: 'relative',
  },
  heroImage: {
    backgroundColor: colors.chip,
    height: '100%',
    width: '100%',
  },
  heroFallback: {
    alignItems: 'center',
    backgroundColor: colors.accentSoft,
    height: '100%',
    justifyContent: 'center',
    width: '100%',
  },
  sheet: {
    backgroundColor: colors.cream,
    borderTopEndRadius: 28,
    borderTopStartRadius: 28,
    gap: spacing.md,
    marginTop: -spacing['2xl'],
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  titleCopy: {
    gap: spacing.xs,
  },
  pills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  section: {
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
  },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    gap: spacing.md,
    marginHorizontal: spacing.xl,
    marginTop: spacing.lg,
    padding: spacing.lg,
  },
  warrantyCard: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    gap: spacing.xs,
    marginHorizontal: spacing.xl,
    marginTop: spacing.lg,
    padding: spacing.lg,
  },
  warrantyCardActive: {
    backgroundColor: colors.ink,
    borderWidth: 0,
  },
  warrantyHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  detailRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  detailDivider: {
    borderBottomColor: colors.line,
    borderBottomWidth: 1,
  },
  historyRow: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
  },
  historyIcon: {
    alignItems: 'center',
    backgroundColor: colors.chip,
    borderRadius: radii.input,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  historyBody: {
    flex: 1,
    gap: spacing.xs,
  },
});
