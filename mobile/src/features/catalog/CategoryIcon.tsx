import { useState } from 'react';
import { Image, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Ellipse, Path } from 'react-native-svg';
import { colors } from '../../theme';
import { safeImageUrl } from './types';

const drawings = {
  coffee: <Path d="M4 8h12v8a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4ZM16 9h2a3 3 0 0 1 0 6h-2M7 3v2M11 3v2M15 3v2" />,
  'coffee-bean': <><Ellipse cx="12" cy="12" rx="7" ry="10" rotation={35} origin="12,12" /><Path d="M17 4C7 7 17 17 7 20" /></>,
  capsule: <Path d="M4 3h16v3H4ZM6 6l2 14h8l2-14M10 9v8M14 9v8" />,
  settings: <><Circle cx="12" cy="12" r="4" /><Path d="M10 2h4l1 3 3 1 3 4-2 2 2 3-3 4-3-1-1 4h-4l-1-4-3 1-3-4 2-3-2-2 3-4 3-1Z" /></>,
  sparkles: <Path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5ZM4 2v4M2 4h4" />,
  wrench: <Path d="M14 5a5 5 0 0 0-6 6l-5 5a3 3 0 0 0 4 4l5-5a5 5 0 0 0 6-6l-3 3-3-3 3-3Z" />,
  generic: <Path d="M3 6h18v15H3ZM3 6l4-4h10l4 4M9 6v5h6V6" />,
};
export function CategoryIcon({ iconKey, label, size = 48 }: { iconKey?: string | null; label: string; size?: number }) {
  const key = Object.hasOwn(drawings, iconKey ?? '') ? iconKey as keyof typeof drawings : 'generic';
  return <View accessible accessibilityRole="image" accessibilityLabel={label} testID={`category-icon-${key}`}>
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={colors.accentDeep} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">{drawings[key]}</Svg>
  </View>;
}

export function CatalogPhoto({ url, label, iconKey, iconSize, style }: { url?: string | null; label: string; iconKey?: string | null; iconSize?: number; style?: StyleProp<ViewStyle> }) {
  const [failed, setFailed] = useState<string>();
  const [previousUrl, setPreviousUrl] = useState(url);
  if (previousUrl !== url) { setPreviousUrl(url); setFailed(undefined); }
  return <View style={[{ alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentSoft }, style]}>
    {url && safeImageUrl(url) && url !== failed ? <Image accessible accessibilityRole="image" accessibilityLabel={label} source={{ uri: url }} resizeMode="cover" style={{ width: '100%', height: '100%' }} onError={() => setFailed(url)} /> : <CategoryIcon iconKey={iconKey} label={label} size={iconSize} />}
  </View>;
}
