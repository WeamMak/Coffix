import Feather from '@expo/vector-icons/Feather';
import { StyleSheet } from 'react-native';
import { colors } from '../theme';
import { IconButton, type IconButtonProps } from './IconButton';

type BackButtonProps = Omit<IconButtonProps, 'icon' | 'accessibilityLabel'> & {
  accessibilityLabel?: string;
};

export function BackButton({ accessibilityLabel = 'חזרה', style, ...props }: BackButtonProps) {
  return <IconButton
    {...props}
    accessibilityLabel={accessibilityLabel}
    icon={<Feather color={colors.ink} name="chevron-right" size={20} />}
    style={[style, styles.circle]}
  />;
}

const styles = StyleSheet.create({
  circle: { width: 44, height: 44, borderRadius: 22 },
});
