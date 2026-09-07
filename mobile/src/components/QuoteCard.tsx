import { Card } from './Card';
import { Text } from './Text';
import { formatIls } from '../features/catalog/types';
import type { ServiceRequest } from '../features/service/api';
import { spacing } from '../theme';

export function QuoteCard({ request }: { request: ServiceRequest }) {
  const quote = request.quotes.at(-1);
  if (!quote || request.allowed_actions.some(action => ['accept_quote', 'pay_additional'].includes(action))) return null;
  return <Card style={{ gap: spacing.md }}>
    <Text variant="sectionTitle">הצעת מחיר נוספת: {formatIls(quote.amount_agorot)}</Text>
    <Text>{quote.explanation}</Text>
    {quote.decision === 'accepted' ? <Text>ההצעה אושרה.</Text> : null}
    {quote.decision === 'declined' ? <Text>ההצעה נדחתה והבקשה בוטלה. דמי האבחון אינם מוחזרים.</Text> : null}
  </Card>;
}
