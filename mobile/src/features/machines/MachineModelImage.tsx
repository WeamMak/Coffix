import { useState } from 'react';
import { Image, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors } from '../../theme';
import { safeImageUrl } from '../catalog/types';
import { resolveMediaUrl } from '../../api/mediaUrl';

type PhotoState = {
  mediaId?: string;
  url?: string;
  status: 'loading' | 'loaded' | 'failed';
};

export function MachineModelImage({ model, style }: {
  model: { manufacturer: string; model_name: string; image_url?: string | null; image_media_id?: string | null }; style?: StyleProp<ViewStyle>;
}) {
  const url = model.image_url && safeImageUrl(model.image_url) ? resolveMediaUrl(model.image_url) : undefined;
  const mediaId = model.image_media_id ?? undefined;
  const [photo, setPhoto] = useState<PhotoState>({ mediaId, url, status: 'loading' });
  // Signed URLs rotate on every fetch. A loaded photo remains valid for the
  // same media ID; replacements, missing URLs and unsuccessful loads must update.
  if (photo.mediaId !== mediaId || (photo.url !== url && (!url || !mediaId || photo.status !== 'loaded'))) {
    setPhoto({ mediaId, url, status: 'loading' });
  }
  const updateStatus = (status: 'loaded' | 'failed') => setPhoto((current) => {
    if (current.url !== photo.url || current.mediaId !== photo.mediaId) return current;
    // Native cache eviction may require another download. Use fresh credentials.
    if (status === 'failed' && photo.url !== url) return { mediaId, url, status: 'loading' };
    return { ...current, status };
  });
  const label = `${model.manufacturer} ${model.model_name}`;
  return <View style={[{ alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentSoft, overflow: 'hidden' }, style]}>
    {photo.url && photo.status !== 'failed' ? <Image accessible accessibilityRole="image" accessibilityLabel={label} source={{ uri: photo.url }} resizeMode="cover" style={{ width: '100%', height: '100%' }} onLoad={() => updateStatus('loaded')} onError={() => updateStatus('failed')} /> : <View accessible accessibilityRole="image" accessibilityLabel={label} testID="machine-image-fallback"><Svg width={48} height={48} viewBox="0 0 24 24" fill="none" stroke={colors.accentDeep} strokeWidth={1.5}><Path d="M4 2h16v20H4ZM4 7h16M7 5h1M10 5h1M8 11h8v4a4 4 0 0 1-8 0ZM16 11h2v3h-2M7 19h10" /></Svg></View>}
  </View>;
}
