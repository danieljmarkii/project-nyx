// Global test setup for the RN app.
//
// `expo-network`'s subscription shape. jest-expo mocks `addNetworkStateListener`
// as returning a bare `{}`, but the real API returns an `EventSubscription` — so
// any component that removes its listener on unmount (the house pattern, and
// what `hooks/useIsOnline` already does) throws
// `remove is not a function` from inside React's unmount commit, pointing at the
// component rather than at the missing mock.
//
// Patched here rather than per-file because the affected leaf is `PetAvatar`,
// which renders on eight surfaces (tab bar, Home header, switcher, FAB, food
// card, safety banner, archived list): a per-file mock would make every future
// test that happens to render one of those remember a rule about a module it
// never imports. Only the broken function is replaced; the rest of jest-expo's
// mock passes through, and a test that needs to DRIVE network state still
// declares its own `jest.mock('expo-network', …)`, which wins over this one.
jest.mock('expo-network', () => ({
  ...jest.requireActual('expo-network'),
  addNetworkStateListener: jest.fn(() => ({ remove: jest.fn() })),
}));
