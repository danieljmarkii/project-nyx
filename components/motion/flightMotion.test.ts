// The Signal chart's flight, pinned (D2-6 · CUL-1069): one uniform scale and never a
// stretch; the settle is the fold's spring re-expressed; the three beats fit the budget;
// the handoff store's machine — stage → land → settle → release, reverse, abort, TTL —
// and the clone's values on the native driver.

import * as fs from 'fs';
import * as path from 'path';
import { Animated, Platform } from 'react-native';
import { act, renderHook } from '@testing-library/react-native';
import { createElement } from 'react';
import { FOLD_MOTION, UNFOLD_LAYOUT } from './foldMotion';
import { SIGNAL_OPEN_MOTION } from './signalOpenMotion';
import {
  FLIGHT_ENABLED,
  FLIGHT_MOTION,
  FLIGHT_SPRING,
  abortFlight,
  flightActiveFor,
  flightRestMs,
  flightScale,
  getFlightState,
  landFlight,
  peekFlight,
  retargetSource,
  reverseFlight,
  setHeroReady,
  settleInbound,
  settleOutbound,
  stageFlight,
  subscribeFlight,
  useFlightClone,
} from './flightMotion';

const SOURCE = { x: 67, y: 300, width: 278, height: 130 };
const TARGET = { x: 16, y: 180, width: 361, height: 168.8 };
const el = createElement('View');
const payload = { identity: 'reflection:vomit', title: 'Vomiting, the last 8 weeks', source: SOURCE, element: el };

beforeEach(() => {
  jest.useFakeTimers();
  abortFlight();
});
afterEach(() => {
  abortFlight();
  jest.useRealTimers();
});

describe('one aspect, one scale — the flight never stretches', () => {
  it('the scale is by width, and it is the ONE scale (no scaleX / scaleY anywhere in the module or the host)', () => {
    expect(flightScale(SOURCE, TARGET)).toBeCloseTo(361 / 278, 10);
    expect(flightScale({ ...SOURCE, width: 0 }, TARGET)).toBe(1);
    for (const rel of ['flightMotion.ts', 'FlightHost.tsx']) {
      const src = fs.readFileSync(path.join(__dirname, rel), 'utf8');
      // The transform-key shape (`scaleX:`), so the header may NAME the thing it forbids.
      expect(src).not.toMatch(/\bscale[XY]\s*:/);
    }
  });

  it('the clone’s transform is translateX, translateY and one `scale` — asserted off the values the host binds', () => {
    const { result } = renderHook(() => useFlightClone({ reducedMotion: false, appActive: true }));
    const keys = Object.keys(result.current.values).sort();
    expect(keys).toEqual(['scale', 'translateX', 'translateY']);
  });

  it('the kill switch exists for the PM’s ruling on the recording, and is on for the recording', () => {
    expect(FLIGHT_ENABLED).toBe(true);
  });
});

describe('the settle is the fold’s spring, derived', () => {
  it('damping ratio 0.7 mirrors the fold’s iOS `springDamping` (same question, C-34), and the 2 % settle is the fold’s open', () => {
    expect(FLIGHT_MOTION.dampingRatio).toBe(0.7);
    if (Platform.OS === 'ios') {
      expect((UNFOLD_LAYOUT.update as { springDamping?: number }).springDamping).toBe(FLIGHT_MOTION.dampingRatio);
    }
    expect(FLIGHT_MOTION.settleMs).toBe(FOLD_MOTION.openMs);
    expect(FLIGHT_MOTION.settleMs).toBe(370);
  });

  it('stiffness / damping / mass are ωn², 2ζωn, 1 for those two numbers — the physics is the fold’s and nothing else', () => {
    const zeta = FLIGHT_MOTION.dampingRatio;
    const omega = 4 / (zeta * (FLIGHT_MOTION.settleMs / 1000));
    expect(FLIGHT_SPRING.stiffness).toBeCloseTo(omega * omega, 6);
    expect(FLIGHT_SPRING.damping).toBeCloseTo(2 * zeta * omega, 6);
    expect(FLIGHT_SPRING.mass).toBe(1);
    // The derived ratio, read back from the spring: ζ = c / (2·√(k·m)).
    expect(FLIGHT_SPRING.damping / (2 * Math.sqrt(FLIGHT_SPRING.stiffness * FLIGHT_SPRING.mass))).toBeCloseTo(zeta, 6);
    // Under-damped, so it overshoots once (the felt settle) and never rings.
    expect(zeta).toBeGreaterThan(0.5);
    expect(zeta).toBeLessThan(1);
  });

  it('the beats fit the budget: the ground’s fade, the settle, the sentence’s landing and the longest flight’s rest, all ≤ 700', () => {
    expect(FLIGHT_MOTION.budgetMs).toBe(SIGNAL_OPEN_MOTION.budgetMs);
    expect(FLIGHT_MOTION.groundMs).toBe(FOLD_MOTION.closeMs);
    expect(FLIGHT_MOTION.groundMs).toBeLessThanOrEqual(FLIGHT_MOTION.budgetMs);
    expect(FLIGHT_MOTION.settleMs).toBeLessThanOrEqual(FLIGHT_MOTION.budgetMs);
    expect(SIGNAL_OPEN_MOTION.landDelayMs + SIGNAL_OPEN_MOTION.landMs).toBeLessThanOrEqual(FLIGHT_MOTION.budgetMs);
    // The spring declares itself arrived when its envelope falls inside `restPt`; over the
    // longest flight the budget is pinned for, that is inside 700ms too.
    expect(flightRestMs(FLIGHT_MOTION.maxFlightPt)).toBeLessThanOrEqual(FLIGHT_MOTION.budgetMs);
    expect(flightRestMs(0)).toBe(0);
    // And the derivation is monotone — a longer flight rests later, never earlier.
    expect(flightRestMs(100)).toBeLessThan(flightRestMs(FLIGHT_MOTION.maxFlightPt));
  });

  it('no beat is under 150ms or over 500ms without a reason written down (the Motion Designer’s floor)', () => {
    for (const ms of [FLIGHT_MOTION.groundMs, FLIGHT_MOTION.settleMs]) {
      expect(ms).toBeGreaterThanOrEqual(150);
      expect(ms).toBeLessThanOrEqual(500);
    }
  });
});

describe('the handoff store — stage → land → settle → release', () => {
  it('stage: the clone is at the source, the route sees the flight, the card’s chart is hidden', () => {
    expect(peekFlight(payload.identity)).toBe(false);
    stageFlight(payload, 1000);
    expect(getFlightState().phase).toBe('staged');
    expect(getFlightState().flight).toMatchObject({ ...payload, target: null, heroReady: false, stagedAt: 1000 });
    expect(peekFlight(payload.identity)).toBe(true);
    expect(peekFlight('other')).toBe(false);
    expect(flightActiveFor(getFlightState(), payload.identity)).toBe(true);
    expect(flightActiveFor(getFlightState(), 'other')).toBe(false);
  });

  it('land: the target goes on and the flight is outbound; an equal rect keeps the object (no spring restart); a new one retargets', () => {
    stageFlight(payload);
    landFlight(payload.identity, TARGET);
    expect(getFlightState().phase).toBe('outbound');
    const before = getFlightState().flight;
    landFlight(payload.identity, { ...TARGET });
    expect(getFlightState().flight).toBe(before);
    landFlight(payload.identity, { ...TARGET, y: 200 });
    expect(getFlightState().flight?.target?.y).toBe(200);
    expect(getFlightState().phase).toBe('outbound');
  });

  it('land for another identity, or before a stage, is ignored', () => {
    landFlight('other', TARGET);
    expect(getFlightState().phase).toBe('idle');
    stageFlight(payload);
    landFlight('other', TARGET);
    expect(getFlightState().phase).toBe('staged');
  });

  it('the release is ONE store update: settle then hero → idle in one set; hero then settle → idle in one set', () => {
    const seen: string[] = [];
    const off = subscribeFlight(() => seen.push(getFlightState().phase));
    stageFlight(payload);
    landFlight(payload.identity, TARGET);
    settleOutbound();
    expect(getFlightState().phase).toBe('landed');
    setHeroReady(payload.identity, true);
    expect(getFlightState().phase).toBe('idle');
    // The record lingers at idle for the reverse.
    expect(getFlightState().flight?.identity).toBe(payload.identity);
    expect(flightActiveFor(getFlightState(), payload.identity)).toBe(false);
    expect(seen).toEqual(['staged', 'outbound', 'landed', 'idle']);

    // The other order.
    seen.length = 0;
    stageFlight(payload);
    landFlight(payload.identity, TARGET);
    setHeroReady(payload.identity, true);
    expect(getFlightState().phase).toBe('outbound');
    settleOutbound();
    expect(getFlightState().phase).toBe('idle');
    expect(seen).toEqual(['staged', 'outbound', 'outbound', 'idle']);
    off();
  });

  it('settleOutbound outside outbound is a no-op; setHeroReady with no change is a no-op', () => {
    settleOutbound();
    expect(getFlightState().phase).toBe('idle');
    stageFlight(payload);
    const listener = jest.fn();
    const off = subscribeFlight(listener);
    setHeroReady(payload.identity, false);
    settleOutbound();
    expect(listener).not.toHaveBeenCalled();
    off();
  });

  it('reverse: from idle-with-record, landed or outbound → inbound; the card retargets; settleInbound spends the record', () => {
    stageFlight(payload);
    landFlight(payload.identity, TARGET);
    settleOutbound();
    setHeroReady(payload.identity, true);
    expect(reverseFlight(payload.identity)).toBe(true);
    expect(getFlightState().phase).toBe('inbound');
    expect(reverseFlight(payload.identity)).toBe(true);
    const moved = { ...SOURCE, y: 340 };
    retargetSource(payload.identity, moved);
    expect(getFlightState().flight?.source).toEqual(moved);
    const same = getFlightState().flight;
    retargetSource(payload.identity, { ...moved });
    expect(getFlightState().flight).toBe(same);
    settleInbound();
    expect(getFlightState()).toEqual({ phase: 'idle', flight: null });
    expect(reverseFlight(payload.identity)).toBe(false);
  });

  it('reverse with no target (the screen never landed it) is refused — the caller pops plainly', () => {
    stageFlight(payload);
    expect(reverseFlight(payload.identity)).toBe(false);
    expect(getFlightState().phase).toBe('staged');
    expect(reverseFlight('other')).toBe(false);
  });

  it('retargetSource outside inbound is ignored', () => {
    stageFlight(payload);
    retargetSource(payload.identity, { ...SOURCE, y: 1 });
    expect(getFlightState().flight?.source).toEqual(SOURCE);
  });

  it('a staged flight no screen lands is abandoned after the TTL, so the card’s chart is never left hidden; a landed one is not', () => {
    stageFlight(payload);
    jest.advanceTimersByTime(FLIGHT_MOTION.handoffTtlMs - 1);
    expect(getFlightState().phase).toBe('staged');
    jest.advanceTimersByTime(1);
    expect(getFlightState()).toEqual({ phase: 'idle', flight: null });

    stageFlight(payload);
    landFlight(payload.identity, TARGET);
    jest.advanceTimersByTime(FLIGHT_MOTION.handoffTtlMs * 2);
    expect(getFlightState().phase).toBe('outbound');
  });

  it('a re-stage inside the TTL window belongs to the new flight: the old timer cannot abort it', () => {
    stageFlight(payload, 1);
    jest.advanceTimersByTime(FLIGHT_MOTION.handoffTtlMs - 10);
    stageFlight({ ...payload, identity: 'k2' }, 2);
    jest.advanceTimersByTime(20);
    expect(getFlightState().phase).toBe('staged');
    expect(getFlightState().flight?.identity).toBe('k2');
  });

  it('abort clears everything, including a lingering record, and notifies once', () => {
    stageFlight(payload);
    landFlight(payload.identity, TARGET);
    settleOutbound();
    setHeroReady(payload.identity, true);
    const listener = jest.fn();
    const off = subscribeFlight(listener);
    abortFlight();
    expect(getFlightState()).toEqual({ phase: 'idle', flight: null });
    expect(listener).toHaveBeenCalledTimes(1);
    abortFlight();
    expect(listener).toHaveBeenCalledTimes(1);
    off();
  });
});

describe('useFlightClone — the values on the native driver', () => {
  type Fake = { start: (cb?: (r: { finished: boolean }) => void) => void; stop: () => void; cb: ((r: { finished: boolean }) => void) | null };
  let springs: Array<{ value: Animated.Value; config: Record<string, unknown>; anim: Fake }>;
  let springSpy: jest.SpyInstance;
  beforeEach(() => {
    springs = [];
    springSpy = jest.spyOn(Animated, 'spring').mockImplementation(((value: Animated.Value, config: Record<string, unknown>) => {
      const anim: Fake = {
        cb: null,
        start(cb) {
          anim.cb = cb ?? null;
        },
        stop() {
          const cb = anim.cb;
          anim.cb = null;
          cb?.({ finished: false });
        },
      };
      springs.push({ value, config, anim });
      return anim as unknown as Animated.CompositeAnimation;
    }) as unknown as typeof Animated.spring);
  });
  afterEach(() => springSpy.mockRestore());

  const read = (v: Animated.Value) => (v as unknown as { __getValue: () => number }).__getValue();
  const finishAll = () => {
    for (const s of springs) {
      const cb = s.anim.cb;
      s.anim.cb = null;
      cb?.({ finished: true });
    }
  };

  it('staged: pinned at the source, nothing started; landed: three springs to the target with the fold’s physics; rest settles', () => {
    const { result } = renderHook(() => useFlightClone({ reducedMotion: false, appActive: true }));
    act(() => stageFlight(payload));
    expect(read(result.current.values.translateX)).toBe(SOURCE.x);
    expect(read(result.current.values.translateY)).toBe(SOURCE.y);
    expect(read(result.current.values.scale)).toBe(1);
    expect(springSpy).not.toHaveBeenCalled();

    act(() => landFlight(payload.identity, TARGET));
    expect(springs).toHaveLength(3);
    const toValues = springs.map((s) => s.config.toValue);
    expect(toValues).toEqual([TARGET.x, TARGET.y, flightScale(SOURCE, TARGET)]);
    for (const s of springs) {
      expect(s.config).toMatchObject({ useNativeDriver: true, ...FLIGHT_SPRING });
    }
    expect(springs[0].config.restDisplacementThreshold).toBe(FLIGHT_MOTION.restPt);
    expect(springs[2].config.restDisplacementThreshold).toBe(FLIGHT_MOTION.restScale);

    // Two of three at rest: not yet.
    act(() => {
      springs[0].anim.cb?.({ finished: true });
      springs[1].anim.cb?.({ finished: true });
    });
    expect(getFlightState().phase).toBe('outbound');
    act(() => springs[2].anim.cb?.({ finished: true }));
    expect(getFlightState().phase).toBe('landed');
    // The rest PINS the pose (a native-driver value never writes its end back).
    expect(read(result.current.values.translateX)).toBe(TARGET.x);
    expect(read(result.current.values.scale)).toBeCloseTo(flightScale(SOURCE, TARGET), 10);
  });

  it('a heroReady flip mid-flight does not restart the spring; a retarget does', () => {
    renderHook(() => useFlightClone({ reducedMotion: false, appActive: true }));
    act(() => {
      stageFlight(payload);
      landFlight(payload.identity, TARGET);
    });
    expect(springs).toHaveLength(3);
    act(() => setHeroReady(payload.identity, true));
    expect(springs).toHaveLength(3);
    act(() => landFlight(payload.identity, { ...TARGET, y: 220 }));
    expect(springs).toHaveLength(6);
    expect(springs[4].config.toValue).toBe(220);
  });

  it('a stop (`finished: false`) never settles — whoever stopped it owns the end state', () => {
    renderHook(() => useFlightClone({ reducedMotion: false, appActive: true }));
    act(() => {
      stageFlight(payload);
      landFlight(payload.identity, TARGET);
    });
    act(() => {
      for (const s of springs) s.anim.stop();
    });
    expect(getFlightState().phase).toBe('outbound');
  });

  it('reverse: springs home, the card’s retarget re-aims, rest spends the record', () => {
    const { result } = renderHook(() => useFlightClone({ reducedMotion: false, appActive: true }));
    act(() => {
      stageFlight(payload);
      landFlight(payload.identity, TARGET);
    });
    act(() => finishAll());
    act(() => setHeroReady(payload.identity, true));
    expect(getFlightState().phase).toBe('idle');
    springs = [];
    act(() => {
      reverseFlight(payload.identity);
    });
    expect(springs.map((s) => s.config.toValue)).toEqual([SOURCE.x, SOURCE.y, 1]);
    act(() => retargetSource(payload.identity, { ...SOURCE, y: 340 }));
    expect(springs[4].config.toValue).toBe(340);
    act(() => finishAll());
    expect(getFlightState()).toEqual({ phase: 'idle', flight: null });
    expect(read(result.current.values.translateY)).toBe(340);
    expect(read(result.current.values.scale)).toBe(1);
  });

  it('app blur or reduced motion mid-flight FINISHES the flight at its end state — never pauses it', () => {
    const { result, rerender } = renderHook((p: { reducedMotion: boolean; appActive: boolean }) => useFlightClone(p), {
      initialProps: { reducedMotion: false, appActive: true },
    });
    act(() => {
      stageFlight(payload);
      landFlight(payload.identity, TARGET);
    });
    expect(springs).toHaveLength(3);
    rerender({ reducedMotion: false, appActive: false });
    expect(getFlightState().phase).toBe('landed');
    expect(read(result.current.values.translateY)).toBe(TARGET.y);

    act(() => setHeroReady(payload.identity, true));
    springs = [];
    act(() => {
      reverseFlight(payload.identity);
    });
    // Blurred: the reverse finishes at once, without a spring.
    expect(springs).toHaveLength(0);
    expect(getFlightState()).toEqual({ phase: 'idle', flight: null });
    expect(read(result.current.values.translateY)).toBe(SOURCE.y);
  });

  it('unmounting the host stops what is running', () => {
    const { unmount } = renderHook(() => useFlightClone({ reducedMotion: false, appActive: true }));
    act(() => {
      stageFlight(payload);
      landFlight(payload.identity, TARGET);
    });
    const stops = springs.map((s) => jest.spyOn(s.anim, 'stop'));
    unmount();
    for (const s of stops) expect(s).toHaveBeenCalled();
  });
});
