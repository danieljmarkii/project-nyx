// How the record screen is pushed (HV-10 / CUL-1167; History v2 §3.10, §4 "Open a record").

import { recordRouteOptions } from './recordRoute';

describe('recordRouteOptions', () => {
  it('the platform\'s own push with motion on; no animation under Reduce Motion', () => {
    expect(recordRouteOptions(false)).toEqual({ animation: 'default' });
    expect(recordRouteOptions(true)).toEqual({ animation: 'none' });
  });

  it('the root stack declares the record route with it, read from the one Reduce Motion store', () => {
    // A source pin (the root layout cannot be rendered here): the route is declared with
    // these options, from the hook every other surface reads (CUL-1123).
    const src = require('fs').readFileSync(require('path').join(__dirname, '../app/_layout.tsx'), 'utf8') as string;
    expect(src).toContain('<Stack.Screen name="event/[id]" options={recordRouteOptions(reducedMotion)} />');
    expect(src).toMatch(/const reducedMotion = useReducedMotion\(\);/);
  });
});
