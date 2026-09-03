import { act, render } from '@testing-library/react-native';
import { Text } from 'react-native';

import {
  formatRemaining,
  remainingSeconds,
  useCartExpiry,
} from '../../src/features/cart/expiry';

function ExpiryHarness({ expiresAt, onExpired }: {
  expiresAt: string;
  onExpired: () => void;
}) {
  const seconds = useCartExpiry(expiresAt, onExpired);
  return <Text>{formatRemaining(seconds)}</Text>;
}

describe('cart reservation expiry', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-03T10:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('rounds remaining server time up and formats a Hebrew-safe clock', () => {
    expect(remainingSeconds('2026-09-03T10:02:05.001Z')).toBe(126);
    expect(formatRemaining(125)).toBe('02:05');
    expect(formatRemaining(-1)).toBe('00:00');
  });

  it('updates the informational countdown and reconciles once at zero', async () => {
    const onExpired = jest.fn();
    const view = await render(
      <ExpiryHarness
        expiresAt="2026-09-03T10:00:02.000Z"
        onExpired={onExpired}
      />,
    );

    expect(view.getByText('00:02')).toBeOnTheScreen();
    await act(async () => {
      jest.advanceTimersByTime(2_000);
    });
    expect(view.getByText('00:00')).toBeOnTheScreen();
    expect(onExpired).toHaveBeenCalledTimes(1);
    await act(async () => {
      jest.advanceTimersByTime(5_000);
    });
    expect(onExpired).toHaveBeenCalledTimes(1);
  });
});
