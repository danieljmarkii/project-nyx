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

// A printed test instance. Jest 30's pretty-format walks a ReactTestInstance's whole fiber
// graph (React 19.3 hangs a debug stack off every fiber) whenever a matcher prints one, so a
// failing `expect(queryByText(x)).toBeNull()` poll inside `waitFor` blocked the event loop
// for ~20s and starved the timers the poll was waiting on (the consent door's 700ms
// dismiss fallback). pretty-format honours `toJSON`, so the instance prints as its type and
// its own string props instead. Printing only: no matcher compares through `toJSON`.
{
  const React = require('react');
  const TestRenderer = require('react-test-renderer');
  const wasActEnv = globalThis.IS_REACT_ACT_ENVIRONMENT;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  let probe;
  React.act(() => {
    probe = TestRenderer.create(React.createElement('View'));
  });
  const proto = Object.getPrototypeOf(probe.root);
  React.act(() => probe.unmount());
  globalThis.IS_REACT_ACT_ENVIRONMENT = wasActEnv;
  Object.defineProperty(proto, 'toJSON', {
    configurable: true,
    value() {
      const type = typeof this.type === 'string' ? this.type : this.type?.displayName ?? this.type?.name ?? 'Unknown';
      const props = {};
      for (const [k, v] of Object.entries(this.props ?? {})) {
        if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') props[k] = v;
      }
      if (typeof this.props?.children === 'string') props.children = this.props.children;
      return { type, props };
    },
  });
}
