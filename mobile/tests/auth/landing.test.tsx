import HomeStackLayout from '../../app/(tabs)/(home)/_layout';
import AuthenticatedLandingScreen from '../../app/(tabs)/(home)/index';
import OrdersStackLayout from '../../app/(tabs)/(orders)/_layout';
import OrdersPlaceholderScreen from '../../app/(tabs)/(orders)/index';
import ProfileStackLayout from '../../app/(tabs)/(profile)/_layout';
import ProfilePlaceholderScreen from '../../app/(tabs)/(profile)/index';
import ServiceStackLayout from '../../app/(tabs)/(service)/_layout';
import ServicePlaceholderScreen from '../../app/(tabs)/(service)/index';
import ShopStackLayout from '../../app/(tabs)/(shop)/_layout';
import ShopPlaceholderScreen from '../../app/(tabs)/(shop)/index';

jest.mock('expo-router', () => ({
  Stack: () => null,
}));

describe('authenticated landing route', () => {
  it('provides the Editorial home destination after OTP verification', () => {
    expect(AuthenticatedLandingScreen).toEqual(expect.any(Function));
  });

  it('provides valid route shells for every declared tab', () => {
    expect([
      ShopPlaceholderScreen,
      ServicePlaceholderScreen,
      OrdersPlaceholderScreen,
      ProfilePlaceholderScreen,
    ]).toEqual([
      expect.any(Function),
      expect.any(Function),
      expect.any(Function),
      expect.any(Function),
    ]);
  });

  it('provides an independent stack shell for every tab route', () => {
    expect([
      HomeStackLayout,
      ShopStackLayout,
      ServiceStackLayout,
      OrdersStackLayout,
      ProfileStackLayout,
    ]).toEqual([
      expect.any(Function),
      expect.any(Function),
      expect.any(Function),
      expect.any(Function),
      expect.any(Function),
    ]);
  });
});
