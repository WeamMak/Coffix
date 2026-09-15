import { ActivityIndicator, RefreshControl } from 'react-native';
import { Button } from '../../../src/components/Button';
import { Text } from '../../../src/components/Text';
import { ExternalAction, useShopInformation } from '../../../src/features/profile/information';
import { ProfilePage } from '../../../src/features/profile/ProfilePage';

export default function ContactRoute() {
  const query = useShopInformation();
  const info = query.data;
  const phone = info?.phone && /^\+[1-9][0-9]{7,14}$/.test(info.phone) ? info.phone : null;
  const whatsapp = info?.whatsapp && /^\+[1-9][0-9]{7,14}$/.test(info.whatsapp) ? info.whatsapp : null;
  const email = info?.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(info.email) ? info.email : null;
  return <ProfilePage title="צרו קשר" refreshControl={<RefreshControl accessibilityLabel="רענון פרטי החנות" refreshing={query.isFetching && !query.isPending} onRefresh={() => void query.refetch()} />}>
    {query.isPending ? <ActivityIndicator accessibilityLabel="טוענים פרטי חנות" /> : null}
    {query.isError ? <><Text>לא הצלחנו לטעון את פרטי החנות.</Text><Button onPress={() => void query.refetch()}>ניסיון נוסף</Button></> : null}
    {info ? <>
    <Text>נשמח לעזור בשאלות על הזמנה, מכונה או בקשת שירות. כדאי להכין את מספר ההזמנה או הבקשה.</Text>
    {phone ? <><Text>{'\u2066'}{phone}{'\u2069'}</Text><ExternalAction label="התקשרו אלינו" url={`tel:${phone}`} /></> : null}
    {whatsapp ? <ExternalAction label="שליחת הודעה ב־WhatsApp" url={`https://wa.me/${whatsapp.replace('+', '')}`} /> : null}
    {email ? <><Text>{email}</Text><ExternalAction label="שליחת דואר אלקטרוני" url={`mailto:${email}`} /></> : null}
    {!phone && !whatsapp && !email ? <Text>פרטי יצירת הקשר יעודכנו בקרוב.</Text> : null}
    <Text variant="sectionTitle">שעות פעילות</Text>
    <Text>{info.opening_hours || 'שעות הפעילות יעודכנו בקרוב.'}</Text>
    <Text variant="sectionTitle">כתובת החנות</Text>
    <Text>{[[info.address.street, info.address.building].filter(Boolean).join(' '), info.address.city, info.address.postal_code].filter(Boolean).join(', ') || 'כתובת החנות תעודכן בקרוב.'}</Text>
  </> : null}</ProfilePage>;
}
