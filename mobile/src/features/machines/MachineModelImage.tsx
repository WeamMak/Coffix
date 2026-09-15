import { useState } from 'react';
import { Image, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors } from '../../theme';
import { safeImageUrl } from '../catalog/types';

export function MachineModelImage({ model, style }: {
  model: { manufacturer: string; model_name: string; image_url?: string | null }; style?: StyleProp<ViewStyle>;
}) {
  const url = model.image_url;
  const [failed, setFailed] = useState<string>();
  const [previousUrl, setPreviousUrl] = useState(url);
  if (previousUrl !== url) { setPreviousUrl(url); setFailed(undefined); }
  const label = `${model.manufacturer} ${model.model_name}`;
  return <View style={[{ alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentSoft }, style]}>
    {url && safeImageUrl(url) && url !== failed ? <Image accessible accessibilityRole="image" accessibilityLabel={label} source={{ uri: url }} resizeMode="cover" style={{ width: '100%', height: '100%' }} onError={() => setFailed(url)} /> : <View accessible accessibilityRole="image" accessibilityLabel={label} testID="machine-image-fallback"><Svg width={48} height={48} viewBox="0 0 24 24" fill="none" stroke={colors.accentDeep} strokeWidth={1.5}><Path d="M4 2h16v20H4ZM4 7h16M7 5h1M10 5h1M8 11h8v4a4 4 0 0 1-8 0ZM16 11h2v3h-2M7 19h10" /></Svg></View>}
  </View>;
}
