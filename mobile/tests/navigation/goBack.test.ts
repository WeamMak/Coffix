import { router } from 'expo-router';

import { goBack } from '../../src/navigation/goBack';

jest.mock('expo-router', () => ({
  router: {
    back: jest.fn(),
    canGoBack: jest.fn(),
    replace: jest.fn(),
  },
}));

describe('history-aware RTL Back navigation', () => {
  beforeEach(() => jest.clearAllMocks());

  it('pops existing stack history', () => {
    jest.mocked(router.canGoBack).mockReturnValue(true);

    goBack('/(tabs)/(shop)');

    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('uses the safe parent only for a deep link without history', () => {
    jest.mocked(router.canGoBack).mockReturnValue(false);

    goBack('/(tabs)/(shop)');

    expect(router.back).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith('/(tabs)/(shop)');
  });
});
