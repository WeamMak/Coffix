import { Text } from '../../../src/components/Text';
import { ExternalAction, ShopInformation } from '../../../src/features/profile/information';
import { ProfilePage } from '../../../src/features/profile/ProfilePage';

export default function ContactRoute() {
  return <ProfilePage title="צרו קשר"><ShopInformation>{info => <>
    <Text>נשמח לעזור בשאלות על הזמנה, מכונה או בקשת שירות. כדאי להכין את מספר ההזמנה או הבקשה.</Text>
    {info.phone ? <><Text>{'\u2066'}{info.phone}{'\u2069'}</Text><ExternalAction label="התקשרו אלינו" url={`tel:${info.phone}`} /></> : null}
    {info.whatsapp ? <ExternalAction label="שליחת הודעה ב־WhatsApp" url={`https://wa.me/${info.whatsapp.replace('+', '')}`} /> : null}
    {!info.phone && !info.whatsapp ? <Text>פרטי יצירת הקשר יעודכנו בקרוב.</Text> : null}
    <Text variant="sectionTitle">שעות פעילות</Text>
    <Text>{info.opening_hours || 'שעות הפעילות יעודכנו בקרוב.'}</Text>
    <Text variant="sectionTitle">כתובת החנות</Text>
    <Text>{[[info.address.street, info.address.building].filter(Boolean).join(' '), info.address.city, info.address.postal_code].filter(Boolean).join(', ') || 'כתובת החנות תעודכן בקרוב.'}</Text>
  </>}</ShopInformation></ProfilePage>;
}
