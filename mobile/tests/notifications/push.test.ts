import { createPushSession, type PushDevice } from '../../src/features/notifications/push';
import { notificationDestination, notificationIdFrom } from '../../src/features/notifications/navigation';
import { notificationsApi } from '../../src/features/notifications/api';
import { QueryClient } from '@tanstack/react-query';

jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn().mockResolvedValue('access') }));
const id = '00000000-0000-4000-8000-000000000001';
function setup() {
  let receive: (data: unknown, opened: boolean) => void = () => {};
  let rotate: (token: string) => void = () => {};
  const unsubscribe = jest.fn();
  const device: PushDevice = {
    platform: 'android', permission: jest.fn().mockResolvedValue(true), token: jest.fn().mockResolvedValue('fcm-one'), deleteToken: jest.fn().mockResolvedValue(undefined),
    subscribe: (message, token) => { receive = message; rotate = token; return unsubscribe; }, initial: jest.fn().mockResolvedValue(null),
  };
  const client = new QueryClient();
  const register = jest.spyOn(notificationsApi, 'register').mockResolvedValue({ id: 'device1', platform: 'android', is_active: true, last_registered_at: '' });
  const deactivate = jest.spyOn(notificationsApi, 'deactivate').mockResolvedValue(undefined);
  const invalidation = jest.spyOn(client, 'invalidateQueries');
  const onOpen = jest.fn();
  const state = jest.fn();
  const session = createPushSession({ scope: 'scope1', device, client, getAccessToken: async () => 'session1-access', onOpen, onState: state });
  return { device, session, register, deactivate, invalidation, receive: (data: unknown, open = false) => receive(data, open), rotate: (token: string) => rotate(token), unsubscribe, state, onOpen };
}
afterEach(() => jest.restoreAllMocks());
it('registers one session-bound token, deduplicates delivery, and still handles a later tap', async () => {
  const h = setup(); await h.session.start();
  expect(h.register).toHaveBeenCalledWith('fcm-one', 'android', 'session1-access');
  h.receive({ notification_id: id, url: 'https://evil.test' }); h.receive({ notification_id: id });
  expect(h.invalidation).toHaveBeenCalledTimes(1);
  h.receive({ notification_id: id }, true); h.receive({ notification_id: id }, true);
  expect(h.onOpen).toHaveBeenCalledTimes(1);
  await h.session.stop();
  expect(h.deactivate).toHaveBeenCalledWith('device1', 'session1-access');
  expect(h.device.deleteToken).toHaveBeenCalled(); expect(h.unsubscribe).toHaveBeenCalled();
  h.receive({ notification_id: id }, true); expect(h.onOpen).toHaveBeenCalledTimes(1);
});
it('does not register after logout during the OS permission prompt', async () => {
  const h = setup(); let grant!: (value: boolean) => void;
  h.device.permission = () => new Promise(resolve => { grant = resolve; });
  const starting = h.session.start(); await h.session.stop(); grant(true); await starting;
  expect(h.register).not.toHaveBeenCalled();
});
it('deactivates a late registration using its original credentials', async () => {
  const h = setup(); let finish!: (value: Awaited<ReturnType<typeof notificationsApi.register>>) => void;
  h.register.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const starting = h.session.start();
  for (let i = 0; i < 10 && !finish; i++) await Promise.resolve();
  const stopping = h.session.stop();
  finish({ id: 'late-device', platform: 'android', is_active: true, last_registered_at: '' });
  await Promise.all([starting, stopping]);
  expect(h.deactivate).toHaveBeenCalledWith('late-device', 'session1-access');
});
it('shows OS denial and never sends an empty or invalid token to the API', async () => {
  const h = setup(); h.device.permission = async () => false; await h.session.start();
  expect(h.state).toHaveBeenLastCalledWith('denied'); expect(h.register).not.toHaveBeenCalled(); await h.session.stop();
  const invalid = setup(); invalid.device.token = async () => ''; await invalid.session.start();
  expect(invalid.state).toHaveBeenLastCalledWith('error'); expect(invalid.register).not.toHaveBeenCalled(); await invalid.session.stop();
});
it('rejects untrusted URLs and malformed notification identifiers', async () => {
  expect(notificationIdFrom({ url: '/orders/foreign' })).toBeNull();
  expect(notificationIdFrom({ notification_id: '../orders/foreign' })).toBeNull();
  const read = jest.spyOn(notificationsApi, 'read').mockRejectedValue(new Error('not owned'));
  await expect(notificationDestination(id)).rejects.toThrow('not owned'); expect(read).toHaveBeenCalledWith(id);
});
it('rotates the native token and retires the old registration', async () => {
  const h = setup(); await h.session.start();
  h.register.mockResolvedValue({ id: 'device2', platform: 'android', is_active: true, last_registered_at: '' });
  h.rotate('fcm-two');
  for (let i = 0; i < 10; i++) await Promise.resolve();
  expect(h.register).toHaveBeenLastCalledWith('fcm-two', 'android', 'session1-access');
  expect(h.deactivate).toHaveBeenCalledWith('device1', 'session1-access');
  await h.session.stop();
  expect(h.deactivate).toHaveBeenLastCalledWith('device2', 'session1-access');
});
it('shows a failed registration without claiming push is connected', async () => {
  const h = setup(); h.register.mockRejectedValue(new Error('invalid token'));
  await h.session.start(); expect(h.state).toHaveBeenLastCalledWith('error'); await h.session.stop();
});
it('waits for in-flight token creation before deleting it on logout', async () => {
  const h = setup(); let finish!: (token: string) => void;
  h.device.token = () => new Promise(resolve => { finish = resolve; });
  const starting = h.session.start();
  for (let i = 0; i < 10 && !finish; i++) await Promise.resolve();
  const stopping = h.session.stop();
  for (let i = 0; i < 5; i++) await Promise.resolve();
  expect(h.device.deleteToken).not.toHaveBeenCalled();
  finish('late-native-token');
  await Promise.all([starting, stopping]);
  expect(h.register).not.toHaveBeenCalled();
  expect(h.device.deleteToken).toHaveBeenCalledTimes(1);
});
