import Constants from 'expo-constants';
import { Text } from '../../../src/components/Text';
import { PushPermissionState } from '../../../src/features/notifications/PushProvider';
import { ExternalAction, ShopInformation } from '../../../src/features/profile/information';
import { ProfilePage } from '../../../src/features/profile/ProfilePage';

export default function SettingsRoute() {
  return <ProfilePage title="הגדרות">
    <Text variant="sectionTitle">התראות במכשיר</Text>
    <PushPermissionState showStatus showSettingsAction={false} />
    <ExternalAction label="פתיחת הגדרות המכשיר" deviceSettings />
    <Text variant="caption">כל העדכונים זמינים במסך ההתראות גם כשהרשאת המכשיר חסומה.</Text>
    <Text variant="sectionTitle">פרטיות ותנאי שירות</Text>
    <ShopInformation>{info => <>
      {info.privacy_policy_url ? <ExternalAction label="מדיניות פרטיות" url={info.privacy_policy_url} /> : info.service_terms_url ? <Text>מדיניות הפרטיות תעודכן בקרוב.</Text> : null}
      {info.service_terms_url ? <ExternalAction label="תנאי שירות" url={info.service_terms_url} /> : info.privacy_policy_url ? <Text>תנאי השירות יעודכנו בקרוב.</Text> : null}
      {!info.privacy_policy_url && !info.service_terms_url ? <Text>מסמכי הפרטיות ותנאי השירות יעודכנו בקרוב.</Text> : null}
    </>}</ShopInformation>
    <Text variant="caption">גרסת האפליקציה: {Constants.expoConfig?.version ?? 'לא זמינה'}</Text>
  </ProfilePage>;
}
