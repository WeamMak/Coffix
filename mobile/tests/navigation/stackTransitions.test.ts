import { Animated } from 'react-native';
import { stackTransitions } from '../../src/navigation/stackTransitions';

type CardInput = Parameters<typeof stackTransitions.cardStyleInterpolator>[0];
function card(current: Animated.Value, next?: Animated.Value, width = 390) {
  const progress = (value: Animated.Value) => value.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  return stackTransitions.cardStyleInterpolator({
    current: { progress: progress(current) },
    next: next ? { progress: progress(next) } : undefined,
    layouts: { screen: { width, height: 844 } },
  } as CardInput).cardStyle.transform[0]!.translateX;
}
const position = (node: Animated.AnimatedAddition<number>) => (node as unknown as { __getValue(): number }).__getValue();

it.each([320, 390, 768])('keeps both cards edge-to-edge during Back on a %ipx screen, without fading', width => {
  const progress = new Animated.Value(1);
  const outgoing = card(progress, undefined, width);
  const previous = card(new Animated.Value(1), progress, width);
  for (const value of [1, 0.75, 0.5, 0.25, 0]) {
    progress.setValue(value);
    expect(position(outgoing)).toBeCloseTo(-width * (1 - value));
    expect(position(previous)).toBeCloseTo(width * value);
    expect(position(outgoing) + width).toBeCloseTo(position(previous));
  }
  expect(stackTransitions.cardStyleInterpolator({
    current: { progress: progress.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) },
    layouts: { screen: { width, height: 844 } },
  } as CardInput).cardStyle).not.toHaveProperty('opacity');
  expect(stackTransitions.detachPreviousScreen).toBe(false);
  expect(stackTransitions.freezeOnBlur).toBe(false);
});
