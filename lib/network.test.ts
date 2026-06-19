import { isOnlineFromState } from './network';

describe('isOnlineFromState', () => {
  it('is online when connected and reachable', () => {
    expect(isOnlineFromState({ isConnected: true, isInternetReachable: true })).toBe(true);
  });

  it('treats null reachability as online (probe still in flight)', () => {
    expect(isOnlineFromState({ isConnected: true, isInternetReachable: null })).toBe(true);
  });

  it('treats undefined reachability as online', () => {
    expect(isOnlineFromState({ isConnected: true })).toBe(true);
  });

  it('is offline when not connected', () => {
    expect(isOnlineFromState({ isConnected: false, isInternetReachable: true })).toBe(false);
  });

  it('is offline when explicitly unreachable', () => {
    expect(isOnlineFromState({ isConnected: true, isInternetReachable: false })).toBe(false);
  });

  it('is offline when connection is null/undefined', () => {
    expect(isOnlineFromState({ isConnected: null, isInternetReachable: null })).toBe(false);
    expect(isOnlineFromState({})).toBe(false);
  });
});
