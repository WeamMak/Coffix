import Feather from '@expo/vector-icons/Feather';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '../../../src/components/Text';
import { ProfilePage } from '../../../src/features/profile/ProfilePage';
import { colors, radii, spacing } from '../../../src/theme';

const questions = [
  { question: 'איך מבצעים הזמנה?', answer: 'בוחרים מוצרים בחנות, מוסיפים לסל וממשיכים לתשלום. המחיר הסופי, כולל משלוח, מוצג לפני אישור התשלום. מצב ההזמנה מופיע בלשונית ההזמנות.' },
  { question: 'איפה רואים את מצב המשלוח?', answer: 'פותחים את ההזמנה בלשונית ההזמנות. לאחר עדכון המשלוח יופיעו פרטי המעקב, אם הוזנו על ידי החנות. לשאלות על מועד ההגעה ניתן לפנות לחנות.' },
  { question: 'איפה בודקים אחריות למכונה?', answer: 'בלשונית השירות פותחים את כרטיס המכונה ובודקים את פרטי האחריות. אחריות Coffix ניתנת למכונות זכאיות שנרכשו באפליקציה בהתאם לתקופה שנקבעה ברכישה. רישום ידני של מכונה אינו מקנה אחריות Coffix.' },
  { question: 'איך קובעים שירות למכונה?', answer: 'בלשונית השירות בוחרים מכונה ופותחים בקשת שירות, מתארים את התקלה ובוחרים הבאה לחנות או איסוף. המועד שבחרתם הוא בקשה, והוא יאושר בנפרד על ידי החנות לאחר תשלום האבחון.' },
  { question: 'מתי משלמים על שירות?', answer: 'לאחר בדיקת הבקשה, החנות שולחת הצעה לתשלום אבחון. אם נדרש תשלום נוסף לתיקון, הוא יוצג בנפרד לאישורכם. התשלום מאושר באפליקציה רק לאחר שהתקבל אישור מספק התשלום.' },
  { question: 'איך מבטלים או מבקשים החזר?', answer: 'בשאלות על ביטול הזמנת מוצר או החזר פונים לחנות. בבקשת שירות, אפשר לבטל את הבקשה מתוך הצעת תשלום פתוחה. תשלומי שירות אינם ניתנים להחזר; דחיית הצעה נוספת אינה מחזירה תשלום אבחון שכבר שולם.' },
];

export default function FaqRoute() {
  const [expanded, setExpanded] = useState<number | null>(null);
  return <ProfilePage title="שאלות נפוצות">{questions.map((item, index) => <View key={item.question} style={{ backgroundColor: colors.card, borderColor: colors.line, borderWidth: 1, borderRadius: radii.card }}>
    <Pressable accessibilityRole="button" accessibilityLabel={item.question} accessibilityState={{ expanded: expanded === index }} onPress={() => setExpanded(expanded === index ? null : index)} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 56, padding: spacing.lg, gap: spacing.md }}>
      <Text style={{ flex: 1 }}>{item.question}</Text><Feather name={expanded === index ? 'minus' : 'plus'} size={18} color={colors.ink} />
    </Pressable>
    {expanded === index ? <Text style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.lg }} color={colors.ink2}>{item.answer}</Text> : null}
  </View>)}</ProfilePage>;
}
