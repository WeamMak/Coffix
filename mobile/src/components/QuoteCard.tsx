import { useState } from 'react';
import { Button } from './Button';
import { Card } from './Card';
import { Text } from './Text';
import { formatIls } from '../features/catalog/types';
import type { ServiceRequest } from '../features/service/api';
import { NON_REFUNDABLE_COPY } from '../features/service/status';
import { spacing } from '../theme';

export function QuoteCard({ request, busy, onDecision }: {
  request: ServiceRequest;
  busy: boolean;
  onDecision: (decision: 'accepted' | 'declined') => Promise<void>;
}) {
  const [confirm, setConfirm] = useState<'accepted' | 'declined' | null>(null);
  const quote = request.quotes.at(-1);
  if (!quote) return null;
  const allowed = (action: string) => request.allowed_actions.includes(action);
  return <Card style={{ gap: spacing.md }}>
    <Text variant="sectionTitle">הצעת מחיר נוספת: {formatIls(quote.amount_agorot)}</Text>
    <Text>{quote.explanation}</Text>
    <Text>{NON_REFUNDABLE_COPY}</Text>
    {quote.decision === 'accepted' ? <Text>{request.state === 'awaiting_additional_payment' ? 'ההצעה אושרה. התיקון ימשיך רק לאחר אישור התשלום הנוסף.' : 'ההצעה אושרה.'}</Text> : null}
    {quote.decision === 'declined' ? <Text>ההצעה נדחתה והבקשה בוטלה. דמי האבחון אינם מוחזרים.</Text> : null}
    {allowed('accept_quote') ? <Button disabled={busy} onPress={() => setConfirm('accepted')}>אישור הצעת מחיר</Button> : null}
    {allowed('decline_quote') ? <Button disabled={busy} tone="soft" onPress={() => setConfirm('declined')}>דחיית הצעת מחיר</Button> : null}
    {confirm && allowed(confirm === 'accepted' ? 'accept_quote' : 'decline_quote') ? <>
      <Text>{confirm === 'accepted' ? `אישור ההצעה בסך ${formatIls(quote.amount_agorot)}. לאחר האישור יש לשלם כדי להמשיך בתיקון.` : 'דחיית ההצעה תבטל את בקשת השירות. דמי האבחון יישארו ללא החזר ולא ייגבה תשלום נוסף.'}</Text>
      <Button disabled={busy} onPress={() => void onDecision(confirm).finally(() => setConfirm(null))}>
        {confirm === 'accepted' ? 'אישור קבלה ותשלום בהמשך' : 'אישור דחייה וביטול הבקשה'}
      </Button>
      <Button disabled={busy} tone="soft" onPress={() => setConfirm(null)}>חזרה להצעה</Button>
    </> : null}
  </Card>;
}
