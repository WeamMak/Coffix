import Feather from '@expo/vector-icons/Feather';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Text } from '../../components/Text';
import type { ServiceOptions } from './api';
import type { IntakeDraft } from './intakeStore';
import { PickupAddress } from './PickupAddress';
import { PREFERRED_WINDOW_COPY } from './status';
import { colors, spacing } from '../../theme';

const dayLabel = (iso: string) => new Intl.DateTimeFormat('he-IL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Jerusalem' }).format(new Date(iso));
const clockLabel = (iso: string) => new Intl.DateTimeFormat('he-IL', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem', hour12: false }).format(new Date(iso));
export function LocationFields({ draft, scope, options, update }: { draft: IntakeDraft; scope: string; options: ServiceOptions; update: (changes: Partial<IntakeDraft>) => void }) {
  const windows = options.preferred_windows;
  const dates = [...new Set(windows.map(window => window.start.slice(0, 10)))];
  const [chosenDay, setChosenDay] = useState(draft.preferredStart.slice(0, 10));
  const day = dates.includes(chosenDay) ? chosenDay : dates[0];
  const slots = windows.filter(window => window.start.startsWith(day ?? 'none'));
  return <View style={{ gap: spacing.xl }}>
    <View style={{ gap: spacing.lg }}>
      <Text align="end" variant="screenTitle">איך נאסוף את המכונה?</Text>
      <View style={styles.row}>
        {([{ mode: 'bring_in', label: 'הבאה לחנות', icon: 'map-pin' }, { mode: 'pickup', label: 'איסוף מהבית', icon: 'truck' }] as const).map(item => {
          const selected = draft.locationMode === item.mode;
          return <Pressable key={item.mode} accessibilityRole="button" accessibilityLabel={item.label} accessibilityState={{ selected }} onPress={() => update({ locationMode: item.mode })} style={styles.mode}>
            <Card style={[styles.modeCard, selected && { backgroundColor: colors.ink, borderColor: colors.ink }]}>
              <Feather name={item.icon} size={21} color={selected ? colors.cream : colors.ink} />
              <Text align="end" variant="sectionTitle" color={selected ? colors.cream : colors.ink}>{item.label}</Text>
            </Card>
          </Pressable>;
        })}
      </View>
      {draft.locationMode === 'pickup' ? <PickupAddress draft={draft} scope={scope} update={update} /> : null}
    </View>
    <View style={{ gap: spacing.md }}>
      <Text align="end" variant="caption" color={colors.ink2}>מועד מועדף</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} style={{ direction: 'rtl' }}>
        {dates.map(date => {
          const start = windows.find(window => window.start.startsWith(date))!.start;
          const selected = date === day;
          return <Pressable key={date} accessibilityRole="radio" accessibilityLabel={dayLabel(start)} accessibilityState={{ checked: selected }} onPress={() => { setChosenDay(date); update({ preferredStart: '', preferredEnd: '' }); }} style={[styles.day, selected && styles.selected]}>
            <Text align="end" variant="caption" color={selected ? colors.cream : colors.ink3}>{new Intl.DateTimeFormat('he-IL', { weekday: 'narrow', timeZone: 'Asia/Jerusalem' }).format(new Date(start))}</Text>
            <Text align="end" variant="screenTitle" color={selected ? colors.cream : colors.ink}>{date.slice(8).replace(/^0/, '')}</Text>
          </Pressable>;
        })}
      </ScrollView>
      <View style={[styles.row, { flexWrap: 'wrap' }]}>
        {slots.map(slot => {
          const label = `${clockLabel(slot.start)} – ${clockLabel(slot.end)}`;
          const selected = Date.parse(draft.preferredStart) === Date.parse(slot.start) && Date.parse(draft.preferredEnd) === Date.parse(slot.end);
          return <Pressable key={slot.start} accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{ checked: selected }} onPress={() => update({ preferredStart: slot.start, preferredEnd: slot.end })} style={[styles.slot, selected && { borderColor: colors.accent, backgroundColor: colors.accentSoft }]}>
            <Text align="center" variant="caption" color={selected ? colors.accentDeep : colors.ink} style={{ writingDirection: 'ltr' }}>{label}</Text>
          </Pressable>;
        })}
      </View>
      {!dates.length ? <Text align="end" color={colors.ink3}>אין מועדים לבחירה כרגע. הצוות יתאם איתכם מועד לאחר הבדיקה והתשלום.</Text> : null}
      <Text align="end" variant="caption" color={colors.ink3}>{PREFERRED_WINDOW_COPY} כל השעות לפי שעון ישראל.</Text>
      {draft.preferredStart ? <Button size="small" tone="soft" onPress={() => update({ preferredStart: '', preferredEnd: '' })}>ללא מועד מועדף</Button> : null}
    </View>
  </View>;
}
const styles = StyleSheet.create({
  row: { flexDirection: 'row', direction: 'rtl', gap: spacing.sm },
  mode: { flex: 1 },
  modeCard: { minHeight: 86, padding: spacing.lg, gap: spacing.md, alignItems: 'flex-start', direction: 'rtl', flex: 1 },
  selected: { backgroundColor: colors.ink, borderColor: colors.ink },
  day: { width: 60, minHeight: 64, borderRadius: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.sm },
  slot: { flexGrow: 1, flexBasis: '45%', minHeight: 44, borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, justifyContent: 'center', padding: spacing.md },
});
