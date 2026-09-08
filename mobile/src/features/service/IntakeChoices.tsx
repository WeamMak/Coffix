import Feather from '@expo/vector-icons/Feather';
import { Image, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Card } from '../../components/Card';
import { Text } from '../../components/Text';
import { formatIls, machineModelImage } from '../catalog/types';
import type { ServiceOptions } from './api';
import { colors, fontFamilies, spacing } from '../../theme';

export function IntakeMachine({ manufacturer, model }: { manufacturer: string; model: string }) {
  const name = `${manufacturer} ${model}`;
  return <Card style={styles.machine}>
    <Image accessibilityLabel={`תמונת ${name}`} accessible source={{ uri: machineModelImage(manufacturer, model, name).url }} style={styles.thumbnail} />
    <View style={styles.grow}><Text align="start" variant="caption" color={colors.ink3}>עבור</Text><Text align="start" variant="sectionTitle">{name}</Text></View>
  </Card>;
}

export function ServiceChoices({ types, selectedId, onSelect }: { types: ServiceOptions['service_types']; selectedId: string; onSelect: (id: string) => void }) {
  return <View style={{ gap: spacing.sm }}>
    {types.map(type => {
      const selected = selectedId === type.id;
      return <Pressable key={type.id} accessibilityRole="radio" accessibilityLabel={`${type.label_he}, ${formatIls(type.diagnostic_fee_agorot)}`} accessibilityState={{ checked: selected }} onPress={() => onSelect(type.id)}>
        <Card style={[styles.service, { borderColor: selected ? colors.ink : colors.line }]}>
          <View testID={`service-icon-${type.id}`} style={[styles.icon, { backgroundColor: selected ? colors.ink : colors.chip }]}>
            <Feather name={type.icon_key} size={20} color={selected ? colors.cream : colors.ink} />
          </View>
          <View style={styles.grow}><Text align="start" variant="sectionTitle">{type.label_he}</Text><Text align="start" variant="caption" color={colors.ink3}>{type.tags_he.join(', ')}</Text></View>
          <Text align="end" variant="caption" color={colors.ink2}>{`מ־${formatIls(type.diagnostic_fee_agorot)}`}</Text>
        </Card>
      </Pressable>;
    })}
  </View>;
}

export function IssueDescription({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <Card style={{ padding: spacing.lg, gap: spacing.sm }}>
    <TextInput accessibilityLabel="תיאור התקלה" keyboardType="default" multiline maxLength={4000} value={value} onChangeText={onChange} placeholder="לדוגמה: יוצא לחץ נמוך אחרי שבועיים של שימוש רגיל..." placeholderTextColor={colors.ink3} style={styles.description} />
    <View style={styles.row}><Text align="start" variant="caption" color={colors.ink3}>{value.length} / 4000</Text><Text align="start" variant="caption" color={colors.ink3}>10 תווים לפחות</Text></View>
  </Card>;
}

export function UrgencyChoices({ options, selectedId, onSelect }: { options: ServiceOptions['urgencies']; selectedId?: string; onSelect: (id: string) => void }) {
  return <View style={{ gap: spacing.sm }}>
    <Text align="start" variant="caption" color={colors.ink2}>דחיפות</Text>
    <View style={styles.urgencies}>{options.map(option => <Pressable key={option.id} accessibilityRole="radio" accessibilityLabel={`${option.name_he}, ${option.description_he}, +${option.surcharge_percent}%`} accessibilityState={{ checked: option.id === selectedId }} onPress={() => onSelect(option.id)} style={styles.urgency}>
      <Card style={{ flex: 1, padding: spacing.md, borderColor: option.id === selectedId ? colors.ink : colors.line }}>
        <View style={styles.row}><Text align="start" variant="sectionTitle">{option.name_he}</Text><Text align="end" variant="caption" color={colors.ink3}>{`\u2066+${option.surcharge_percent}%\u2069`}</Text></View>
        <Text align="start" variant="caption" color={colors.ink3}>{option.description_he}</Text>
      </Card>
    </Pressable>)}</View>
    <Text align="start" variant="caption" color={colors.ink3}>תוספת הדחיפות תחול על האבחון ועל עלות תיקון נוספת, אם תידרש.</Text>
  </View>;
}

export function IntakeSummary({ rows }: { rows: [string, string][] }) {
  return <Card style={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.xs }}>
    {rows.map(([label, value], index) => <View key={label} style={[styles.summaryRow, index < rows.length - 1 && styles.divider]}>
      <Text align="start" variant="caption" color={colors.ink3}>{label}</Text><Text style={{ flex: 1 }} align="start">{value}</Text>
    </View>)}
  </Card>;
}

export function DiagnosticReviewNotice() {
  return <View style={styles.notice}>
    <Feather name="info" color={colors.accentDeep} size={16} />
    <Text align="start" variant="caption" color={colors.accentDeep} style={styles.grow}>תזכורת: אגרת האבחון תיקבע לאחר סקירת הצוות. נשלח אליכם הצעה לתשלום לפני תחילת העבודה.</Text>
  </View>;
}

const styles = StyleSheet.create({
  grow: { flex: 1, minWidth: 0 },
  machine: { flexDirection: 'row', direction: 'rtl', alignItems: 'center', gap: spacing.md, padding: spacing.md, marginBottom: spacing.sm },
  thumbnail: { width: 54, height: 54, borderRadius: 12 },
  service: { flexDirection: 'row', direction: 'rtl', alignItems: 'center', gap: spacing.md, minHeight: 74, padding: spacing.md },
  icon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', direction: 'rtl', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  description: { minHeight: 112, textAlignVertical: 'top', textAlign: 'right', writingDirection: 'rtl', color: colors.ink2, fontFamily: fontFamilies.sans.regular, fontSize: 14, padding: 0 },
  urgencies: { flexDirection: 'row', direction: 'rtl', flexWrap: 'wrap', gap: spacing.sm },
  urgency: { flexGrow: 1, flexBasis: '45%' },
  summaryRow: { flexDirection: 'row', direction: 'rtl', alignItems: 'center', gap: spacing.lg, paddingVertical: spacing.lg },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.line },
  notice: { flexDirection: 'row', direction: 'rtl', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.lg, borderRadius: 16, borderWidth: 1, borderColor: colors.accent, backgroundColor: colors.accentSoft },
});
